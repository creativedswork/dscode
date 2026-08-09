import type {
  AgentProcessInput,
  AgentProcessProgress,
  AgentRuntimeSnapshot,
} from "../runtimes/runtime.js";
import type { AgentProcessOutput } from "../runtimes/runtime.js";
import {
  runWithExecutionContext,
  type ExecutionContext,
} from "../../kernel/execution-context.js";
import type { HostFacilities } from "../../kernel/host-facilities.js";
import type {
  AgentExitResult,
  AgentProcess,
  AgentProcessState,
} from "./types.js";

interface ExecutionCallbacks {
  transition(agentProcess: AgentProcess, state: AgentProcessState): Promise<void>;
  progress(agentProcess: AgentProcess, progress: AgentProcessProgress): void;
  output(agentProcess: AgentProcess, text: string): void;
  checkpoint(agentProcess: AgentProcess, snapshot: AgentRuntimeSnapshot): Promise<void>;
  finish(
    agentProcess: AgentProcess,
    state: AgentExitResult["state"],
    output?: string,
    details?: unknown,
    error?: string,
  ): Promise<AgentExitResult>;
  recover?(
    agentProcess: AgentProcess,
    input: AgentProcessInput,
    error: unknown,
    signal: AbortSignal,
  ): Promise<AgentProcessOutput | undefined>;
}

export class AgentExecutionController {
  private readonly executions = new Map<string, Promise<AgentExitResult>>();
  private readonly requestedExit = new Map<string, "terminated" | "killed">();

  constructor(
    private readonly callbacks: ExecutionCallbacks,
    private readonly hostId: string,
    private readonly facilities?: HostFacilities,
  ) {}

  start(agentProcess: AgentProcess, input: AgentProcessInput): Promise<AgentExitResult> {
    const execution = this.run(agentProcess, input);
    this.executions.set(agentProcess.agentId, execution);
    return execution;
  }

  async wait(agentProcess: AgentProcess): Promise<AgentExitResult> {
    if (agentProcess.exit) return agentProcess.exit;
    const execution = this.executions.get(agentProcess.agentId);
    if (!execution) throw new Error(`Agent process ${agentProcess.agentId} is not running`);
    return execution;
  }

  async terminate(agentProcess: AgentProcess): Promise<AgentExitResult> {
    if (agentProcess.exit) return agentProcess.exit;
    this.requestedExit.set(agentProcess.agentId, "terminated");
    await agentProcess.runtime.terminate();
    return this.wait(agentProcess);
  }

  async kill(agentProcess: AgentProcess): Promise<AgentExitResult> {
    if (agentProcess.exit) return agentProcess.exit;
    this.requestedExit.set(agentProcess.agentId, "killed");
    agentProcess.runtime.kill();
    return this.wait(agentProcess);
  }

  async terminateWithTimeout(
    agentProcess: AgentProcess,
    timeoutMs: number,
  ): Promise<AgentExitResult> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.terminate(agentProcess),
        new Promise<AgentExitResult>((resolve) => {
          timer = setTimeout(() => {
            void this.kill(agentProcess).then(resolve);
          }, timeoutMs);
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async run(
    agentProcess: AgentProcess,
    input: AgentProcessInput,
  ): Promise<AgentExitResult> {
    const controller = new AbortController();
    const originalTerminate = agentProcess.runtime.terminate.bind(agentProcess.runtime);
    const originalKill = agentProcess.runtime.kill.bind(agentProcess.runtime);
    agentProcess.runtime.terminate = async () => {
      controller.abort();
      await originalTerminate();
    };
    agentProcess.runtime.kill = () => {
      controller.abort();
      originalKill();
    };

    agentProcess.startedAt = Date.now();
    await this.callbacks.transition(agentProcess, "running");
    try {
      const runtimeInput: AgentProcessInput = {
        ...input,
        onStateChange: async (state) => {
          await input.onStateChange?.(state);
          await this.callbacks.transition(agentProcess, state);
        },
        onProgress: async (progress) => {
          const identifiedProgress = {
            ...progress,
            executionId: progress.executionId ?? agentProcess.agentId,
          };
          await input.onProgress?.(identifiedProgress);
          this.callbacks.progress(agentProcess, identifiedProgress);
        },
        onCheckpoint: async (snapshot) => {
          await input.onCheckpoint?.(snapshot);
          await this.callbacks.checkpoint(agentProcess, snapshot);
        },
      };
      const executionContext: ExecutionContext = {
        hostId: this.hostId,
        processId: agentProcess.agentId,
        parentProcessId: agentProcess.parentAgentId,
        sessionId: agentProcess.parentSessionId,
        application: agentProcess.application.name,
        cwd: agentProcess.context.cwd,
        facilities: this.facilities,
      };
      const output = await runWithExecutionContext(
        executionContext,
        () => agentProcess.runtime.start(runtimeInput, controller.signal),
      );
      const state = this.requestedExit.get(agentProcess.agentId) ?? "completed";
      if (output.text) this.callbacks.output(agentProcess, output.text);
      return await this.callbacks.finish(
        agentProcess,
        state,
        output.text,
        output.details,
      );
    } catch (error) {
      const state = this.requestedExit.get(agentProcess.agentId) ?? "failed";
      if (state === "failed" && this.callbacks.recover) {
        try {
          const recovered = await this.callbacks.recover(
            agentProcess,
            input,
            error,
            controller.signal,
          );
          if (recovered) {
            if (recovered.text) this.callbacks.output(agentProcess, recovered.text);
            return await this.callbacks.finish(
              agentProcess,
              "completed",
              recovered.text,
              recovered.details,
            );
          }
        } catch (fallbackError) {
          const primary = error instanceof Error ? error.message : String(error);
          const fallback = fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError);
          return await this.callbacks.finish(
            agentProcess,
            "failed",
            undefined,
            undefined,
            `${primary}; fallback failed: ${fallback}`,
          );
        }
      }
      return await this.callbacks.finish(
        agentProcess,
        state,
        undefined,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.requestedExit.delete(agentProcess.agentId);
      this.executions.delete(agentProcess.agentId);
    }
  }
}
