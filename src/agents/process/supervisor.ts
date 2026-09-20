import { randomUUID } from "node:crypto";
import type { HarnessEventBus } from "../../application/events.js";
import type { Logger } from "../../kernel/logger.js";
import type { ToolCapability } from "../../kernel/tool-effects.js";
import type { AgentApplicationRegistry } from "../definitions/registry.js";
import type {
  AgentApplicationSnapshot,
  AgentApplicationSummary,
} from "../definitions/types.js";
import type { AgentProcessRuntime } from "../runtimes/runtime.js";
import { AgentExecutionController } from "./execution-controller.js";
import { AgentForegroundController } from "./foreground.js";
import type { AgentFallbackRegistry } from "./fallback.js";
import { AgentProcessLifecycle } from "./lifecycle.js";
import { AgentProcessSpawner } from "./spawner.js";
import type {
  AgentContext,
  AgentExitResult,
  AgentProcess,
  AgentRuntimeFactory,
  SpawnAgentRequest,
  SpawnAgentResult,
} from "./types.js";
import type { AgentProcessStore } from "./store.js";
import { AgentWorktreeManager } from "./worktree.js";
import type { HostFacilities } from "../../kernel/host-facilities.js";
import {
  applyTaskStateMutation,
  immutableTaskState,
  type TaskState,
  type TaskStateMutationCommand,
  type TaskStateMutationResult,
} from "./task-state.js";
export class AgentSupervisor {
  private readonly processes = new Map<string, AgentProcess>();
  private readonly worktrees = new AgentWorktreeManager();
  private readonly lifecycle: AgentProcessLifecycle;
  private readonly executionController: AgentExecutionController;
  private readonly foregroundController: AgentForegroundController;
  private readonly spawner: AgentProcessSpawner;
  private readonly contextMutationQueues = new Map<string, Promise<void>>();
  private taskCompletionGuard?: (
    taskState: Readonly<TaskState>,
  ) => Promise<string | undefined>;

  constructor(
    private readonly registry: AgentApplicationRegistry,
    runtimeFactory: AgentRuntimeFactory,
    private readonly store: AgentProcessStore,
    private readonly events: HarnessEventBus,
    logger: Logger,
    availableTools: () => readonly (string | ToolCapability)[],
    maxDepth = 1,
    fallbackRegistry?: AgentFallbackRegistry,
    hostId = "default",
    facilities?: HostFacilities,
  ) {
    this.lifecycle = new AgentProcessLifecycle(store, events, logger, this.worktrees);
    this.executionController = new AgentExecutionController({
      transition: (agentProcess, state) => this.lifecycle.transition(agentProcess, state),
      progress: (agentProcess, progress) => this.lifecycle.progress(agentProcess, progress),
      output: (agentProcess, text) => this.lifecycle.output(agentProcess, text),
      checkpoint: (agentProcess, snapshot) =>
        this.lifecycle.checkpoint(agentProcess, snapshot),
      finish: (agentProcess, state, output, details, error) =>
        this.lifecycle.finish(agentProcess, state, output, details, error),
      recover: fallbackRegistry
        ? (agentProcess, input, error, signal) =>
            fallbackRegistry.recover(
              agentProcess.application,
              agentProcess.agentId,
              input,
              error,
              signal,
            )
        : undefined,
    }, hostId, facilities);
    this.foregroundController = new AgentForegroundController(
      (agentId) => this.require(agentId),
      this.lifecycle,
    );
    this.spawner = new AgentProcessSpawner({
      registry,
      runtimeFactory,
      lifecycle: this.lifecycle,
      execution: this.executionController,
      foreground: this.foregroundController,
      worktrees: this.worktrees,
      events,
      availableTools,
      requireProcess: (agentId) => this.require(agentId),
      addProcess: (process) => this.processes.set(process.agentId, process),
      maxDepth,
    });
  }

  registerMain(
    application: AgentApplicationSnapshot,
    runtime: AgentProcessRuntime,
    context: AgentContext,
  ): AgentProcess {
    const agentId = `main-${randomUUID()}`;
    const processContext = Object.freeze({ ...context, agentId });
    const agentProcess: AgentProcess = {
      agentId,
      parentSessionId: processContext.parentSessionId,
      application,
      role: "main",
      state: "running",
      attachment: "foreground",
      recording: "process-only",
      contextMode: "minimal",
      context: processContext,
      runtime,
      createdAt: Date.now(),
      startedAt: Date.now(),
    };
    this.processes.set(agentProcess.agentId, agentProcess);
    this.foregroundController.registerMain(agentProcess);
    void this.lifecycle.persist(agentProcess);
    this.events.emit({
      type: "agent:spawned",
      agentId: agentProcess.agentId,
      application: application.name,
      attachment: "foreground",
      input: "",
    });
    return agentProcess;
  }

  async spawn(options: SpawnAgentRequest): Promise<SpawnAgentResult> {
    return this.spawner.spawn(options);
  }

  list(parentAgentId?: string): AgentProcess[] {
    return [...this.processes.values()]
      .filter((agentProcess) => !parentAgentId || agentProcess.parentAgentId === parentAgentId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  listApplications(): readonly AgentApplicationSummary[] {
    return Object.freeze(this.registry.list().map((application) =>
      Object.freeze({
        name: application.name,
        description: application.description,
        source: Object.freeze({ ...application.source }),
      })
    ));
  }

  get(agentId: string): AgentProcess | undefined {
    return this.processes.get(agentId);
  }

  foreground(sessionId: string): AgentProcess | undefined {
    return this.foregroundController.get(sessionId);
  }

  async restoreForeground(
    currentAgentId: string,
    parentAgentId?: string,
  ): Promise<void> {
    await this.foregroundController.restore(currentAgentId, parentAgentId);
  }

  loadPersisted(agentIds: readonly string[]) {
    return this.store.loadMany(agentIds);
  }

  bindTaskCompletionGuard(
    guard: (taskState: Readonly<TaskState>) => Promise<string | undefined>,
  ): void {
    this.taskCompletionGuard = guard;
  }

  getTaskState(sessionId: string): Readonly<TaskState> | undefined {
    const main = this.list().find((process) =>
      process.role === "main" && process.parentSessionId === sessionId
    );
    return main?.context.taskState;
  }

  mutateTaskState(
    command: TaskStateMutationCommand,
  ): Promise<TaskStateMutationResult> {
    const previous = this.contextMutationQueues.get(command.callerAgentId)
      ?? Promise.resolve();
    const result = previous.catch(() => {}).then(async () => {
      const agentProcess = this.get(command.callerAgentId);
      if (!agentProcess || agentProcess.role !== "main") {
        return {
          ok: false as const,
          reason: "not_main" as const,
          message: "TaskState mutations require the owning Main Agent",
        };
      }
      const current = agentProcess.context.taskState;
      if (
        (current?.version ?? 0) !== command.expectedVersion
      ) {
        return {
          ok: false as const,
          reason: "conflict" as const,
          expectedVersion: command.expectedVersion,
          currentVersion: current?.version ?? 0,
          current,
        };
      }
      if (
        command.operation === "initialize"
        && command.sessionId !== agentProcess.parentSessionId
      ) {
        return {
          ok: false as const,
          reason: "invalid_command" as const,
          message: "TaskState Session does not match the owning Main Agent",
          current,
        };
      }
      let next: Readonly<TaskState>;
      try {
        next = immutableTaskState(applyTaskStateMutation(
          current,
          command,
          Date.now(),
        ));
      } catch (error) {
        return {
          ok: false as const,
          reason: "invalid_command" as const,
          message: error instanceof Error ? error.message : String(error),
          current,
        };
      }
      if (next.status === "completed" && this.taskCompletionGuard) {
        const rejection = await this.taskCompletionGuard(next);
        if (rejection) {
          return {
            ok: false as const,
            reason: "invalid_command" as const,
            message: rejection,
            current,
          };
        }
      }
      const previousContext = agentProcess.context;
      const retainedTaskStates = Object.freeze({
        ...(previousContext.retainedTaskStates ?? {}),
        [next.sessionId]: next,
      });
      agentProcess.context = Object.freeze({
        ...previousContext,
        taskState: next,
        retainedTaskStates,
      });
      try {
        await this.lifecycle.persistRequired(agentProcess);
      } catch (error) {
        agentProcess.context = previousContext;
        throw error;
      }
      this.events.emit({
        type: "task:updated",
        sessionId: next.sessionId,
        taskState: next,
      });
      return { ok: true as const, taskState: next };
    });
    const settled = result.then(() => undefined, () => undefined);
    this.contextMutationQueues.set(command.callerAgentId, settled);
    void settled.finally(() => {
      if (this.contextMutationQueues.get(command.callerAgentId) === settled) {
        this.contextMutationQueues.delete(command.callerAgentId);
      }
    });
    return result;
  }

  async updateParentSession(agentId: string, sessionId: string, cwd?: string): Promise<void> {
    const agentProcess = this.require(agentId);
    const previousSessionId = agentProcess.parentSessionId;
    const previousContext = agentProcess.context;
    const ownedPreviousSession = this.foregroundController
      .assertRebindAllowed(agentProcess, sessionId);
    const persistedTaskState = previousSessionId === sessionId
      ? undefined
      : (await this.store.list())
        .filter((process) => process.role === "main")
        .flatMap((process) => [
          process.context.taskState,
          process.context.retainedTaskStates?.[sessionId],
        ])
        .filter((state): state is Readonly<TaskState> =>
          state?.sessionId === sessionId
          && Number.isSafeInteger(state.version)
          && state.version > 0
        )
        .sort((a, b) => b.version - a.version || b.updatedAt - a.updatedAt)[0];
    const retainedTaskStates = {
      ...(previousContext.retainedTaskStates ?? {}),
      ...(previousContext.taskState
        ? { [previousContext.taskState.sessionId]: previousContext.taskState }
        : {}),
    };
    const taskState = [retainedTaskStates[sessionId], persistedTaskState]
      .filter((state): state is Readonly<TaskState> => state !== undefined)
      .sort((a, b) => b.version - a.version || b.updatedAt - a.updatedAt)[0];
    const restoredTaskState = taskState
      ? immutableTaskState(taskState as TaskState)
      : undefined;
    agentProcess.parentSessionId = sessionId;
    agentProcess.context = Object.freeze({
      ...previousContext,
      parentSessionId: sessionId,
      cwd: cwd ?? previousContext.cwd,
      ...(previousSessionId === sessionId
        ? {}
        : {
            activePlan: undefined,
            planBinding: undefined,
            taskState: restoredTaskState,
            retainedTaskStates: Object.freeze({
              ...retainedTaskStates,
              ...(restoredTaskState ? { [sessionId]: restoredTaskState } : {}),
            }),
          }),
    });
    try {
      await this.lifecycle.persistRequired(agentProcess);
    } catch (error) {
      agentProcess.parentSessionId = previousSessionId;
      agentProcess.context = previousContext;
      throw error;
    }
    this.foregroundController.rebind(
      agentProcess,
      previousSessionId,
      ownedPreviousSession,
    );
  }

  async updateMainCapabilities(
    agentId: string,
    availableTools: readonly string[],
  ): Promise<void> {
    const agentProcess = this.require(agentId);
    if (agentProcess.role !== "main") {
      throw new Error(`Agent process ${agentId} is not the Main Process`);
    }
    const previousContext = agentProcess.context;
    const denied = new Set(previousContext.deniedTools);
    agentProcess.context = Object.freeze({
      ...previousContext,
      allowedTools: Object.freeze(
        [...new Set(availableTools)].filter((tool) => !denied.has(tool)),
      ),
    });
    try {
      await this.lifecycle.persistRequired(agentProcess);
    } catch (error) {
      agentProcess.context = previousContext;
      throw error;
    }
  }

  require(agentId: string): AgentProcess {
    const agentProcess = this.get(agentId);
    if (!agentProcess) throw new Error(`Unknown Agent process: ${agentId}`);
    return agentProcess;
  }

  async wait(agentId: string): Promise<AgentExitResult> {
    return this.executionController.wait(this.require(agentId));
  }
  async terminate(agentId: string, timeoutMs?: number): Promise<AgentExitResult> {
    const process = this.require(agentId);
    return timeoutMs === undefined ? this.executionController.terminate(process)
      : this.executionController.terminateWithTimeout(process, timeoutMs);
  }
  async kill(agentId: string): Promise<AgentExitResult> {
    return this.executionController.kill(this.require(agentId));
  }

  async suspend(agentId: string): Promise<void> {
    const agentProcess = this.require(agentId);
    if (!["running", "waiting"].includes(agentProcess.state)) {
      throw new Error(`Agent process ${agentId} is not active`);
    }
    if (!agentProcess.runtime.capabilities.suspend || !agentProcess.runtime.suspend) {
      throw new Error(`Agent process ${agentId} does not support suspend`);
    }
    await agentProcess.runtime.suspend();
    if (agentProcess.exit) return;
    await this.lifecycle.transition(agentProcess, "stopped");
  }

  async continue(agentId: string): Promise<void> {
    const agentProcess = this.require(agentId);
    if (agentProcess.state !== "stopped") {
      throw new Error(`Agent process ${agentId} is not suspended`);
    }
    if (!agentProcess.runtime.capabilities.suspend || !agentProcess.runtime.continue) {
      throw new Error(`Agent process ${agentId} does not support continue`);
    }
    await agentProcess.runtime.continue();
    await this.lifecycle.transition(agentProcess, "running");
  }

  sendMessage(agentId: string, content: string): void {
    const agentProcess = this.require(agentId);
    if (!["running", "waiting", "stopped"].includes(agentProcess.state)) {
      throw new Error(`Agent process ${agentId} has already exited`);
    }
    const runtime = agentProcess.runtime;
    if (!runtime.capabilities.messaging || !runtime.sendMessage) {
      throw new Error(`Agent process ${agentId} does not support messaging`);
    }
    runtime.sendMessage({ content });
  }

  async background(agentId: string): Promise<void> {
    const agentProcess = this.require(agentId);
    if (agentProcess.exit) throw new Error(`Agent process ${agentId} has already exited`);
    if (agentProcess.attachment === "background") return;
    const unsafe = agentProcess.context.allowedTools.filter((tool) =>
      ["write_file", "overwrite_file", "edit", "edit_undo", "bash"].includes(tool),
    );
    if (unsafe.length > 0 && !agentProcess.context.worktree) {
      throw new Error(
        `Agent process ${agentId} cannot detach with unsafe tools: ${unsafe.join(", ")}`,
      );
    }
    agentProcess.attachment = "background";
    agentProcess.context = Object.freeze({
      ...agentProcess.context,
      attachment: "background",
    });
    await this.lifecycle.persist(agentProcess);
    if (this.foregroundController.isOwner(agentProcess)) {
      await this.restoreForeground(agentId);
    }
    this.spawner.detach(agentId);
  }

  consumeNotifications(sessionId: string): AgentExitResult[] {
    return this.lifecycle.consumeNotifications(sessionId);
  }

  async shutdown(): Promise<void> {
    const running = this.list().filter((item) =>
      item.role === "subagent" && !item.exit,
    );
    await Promise.all(running.map((item) =>
      this.executionController.terminateWithTimeout(item, 5_000),
    ));
  }
}
