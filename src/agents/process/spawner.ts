import { randomUUID } from "node:crypto";

import type { HarnessEventBus } from "../../application/events.js";
import type { ToolCapability } from "../../kernel/tool-effects.js";
import type { AgentApplicationRegistry } from "../definitions/registry.js";
import type {
  AgentProcess,
  AgentRuntimeFactory,
  SpawnAgentRequest,
  SpawnAgentResult,
} from "./types.js";
import type { AgentExecutionController } from "./execution-controller.js";
import type {
  AgentForegroundController,
  ForegroundReservation,
} from "./foreground.js";
import type { AgentProcessLifecycle } from "./lifecycle.js";
import { deriveAgentContext } from "./context.js";
import { ContextAssembler } from "./context-selection.js";
import type { AgentWorktreeManager } from "./worktree.js";

interface AgentProcessSpawnerOptions {
  registry: AgentApplicationRegistry;
  runtimeFactory: AgentRuntimeFactory;
  lifecycle: AgentProcessLifecycle;
  execution: AgentExecutionController;
  foreground: AgentForegroundController;
  worktrees: AgentWorktreeManager;
  events: HarnessEventBus;
  availableTools(): readonly (string | ToolCapability)[];
  requireProcess(agentId: string): AgentProcess;
  addProcess(process: AgentProcess): void;
  maxDepth: number;
}

export class AgentProcessSpawner {
  private readonly contextAssembler = new ContextAssembler();
  private readonly detachForeground = new Map<string, () => void>();

  constructor(private readonly options: AgentProcessSpawnerOptions) {}

  async spawn(request: SpawnAgentRequest): Promise<SpawnAgentResult> {
    const parent = this.options.requireProcess(request.parentAgentId);
    const application = this.options.registry.require(request.application);
    const contextMode = request.contextMode ?? "minimal";
    if (contextMode === "selected" && !request.contextSelection?.items.length) {
      throw new Error("contextMode=selected requires a non-empty contextSelection");
    }
    if (contextMode !== "selected" && request.contextSelection) {
      throw new Error(`contextSelection is not valid with contextMode=${contextMode}`);
    }
    if (contextMode === "fork") {
      throw new Error("contextMode=fork is disabled until its evaluation gate passes");
    }
    const contextSelection = request.contextSelection
      ? await this.contextAssembler.assemble(request.contextSelection, parent)
      : undefined;
    const attachment = request.attachment
      ?? (application.background ? "background" : "foreground");
    const agentId = `agent-${randomUUID()}`;
    const baseContext = deriveAgentContext({
      application,
      parent: parent.context,
      availableTools: this.options.availableTools(),
      attachment,
      cwd: request.cwd,
      maxDepth: this.options.maxDepth,
    });
    let reservation: ForegroundReservation | undefined;
    if (attachment === "foreground") {
      reservation = await this.options.foreground.reserve(parent, agentId);
    }
    let worktree;
    let process: AgentProcess | undefined;
    try {
      worktree = application.isolation === "worktree"
        ? await this.options.worktrees.create(baseContext.cwd, agentId)
        : undefined;
      const context = Object.freeze({
        ...baseContext,
        agentId,
        cwd: worktree?.path ?? baseContext.cwd,
        worktree,
      });
      const runtime = this.options.runtimeFactory(application, context, agentId);
      process = {
        agentId,
        parentAgentId: parent.agentId,
        parentSessionId: parent.parentSessionId,
        description: request.description,
        application,
        role: "subagent",
        state: "created",
        attachment,
        recording: request.recording ?? "session",
        contextMode,
        contextSelection,
        context,
        runtime,
        createdAt: Date.now(),
      };
      await this.options.lifecycle.persistRequired(process);
      if (reservation) this.options.foreground.commit(reservation, process);
      this.options.addProcess(process);
    } catch (error) {
      if (worktree) await this.options.worktrees.finalize(worktree);
      if (reservation) await this.options.foreground.release(reservation);
      throw error;
    }
    const agentProcess = process;
    if (!agentProcess) throw new Error("Agent process creation failed");
    this.options.events.emit({
      type: "agent:spawned",
      agentId,
      parentAgentId: parent.agentId,
      application: application.name,
      description: request.description,
      attachment,
      input: request.input.displayPrompt ?? request.input.prompt,
    });
    try {
      await request.onSpawn?.(agentId);
    } catch (error) {
      await this.options.lifecycle.finish(
        agentProcess,
        "failed",
        undefined,
        undefined,
        error instanceof Error ? error.message : String(error),
      );
      if (attachment === "foreground") {
        await this.options.foreground.restore(agentId, parent.agentId);
      }
      throw error;
    }

    const execution = this.options.execution.start(agentProcess, {
      prompt: contextSelection
        ? `${contextSelection.content}\n\n${request.input.prompt}`
        : request.input.prompt,
      attachments: request.input.attachments,
    });
    let removeAbortListener = () => {};
    if (request.signal) {
      const onAbort = () => {
        void this.options.execution.terminate(agentProcess);
      };
      removeAbortListener = () => request.signal?.removeEventListener("abort", onAbort);
      request.signal.addEventListener("abort", onAbort, { once: true });
      void execution.finally(removeAbortListener);
      if (request.signal.aborted) onAbort();
    }
    if (attachment === "background") {
      removeAbortListener();
      void execution;
      return { agentId };
    }
    const detached = new Promise<"detached">((resolve) => {
      this.detachForeground.set(agentId, () => resolve("detached"));
    });
    try {
      const outcome = await Promise.race([
        execution.then((result) => ({ type: "exit" as const, result })),
        detached.then(() => ({ type: "detached" as const })),
      ]);
      if (outcome.type === "detached") removeAbortListener();
      return outcome.type === "exit"
        ? { agentId, result: outcome.result }
        : { agentId };
    } finally {
      this.detachForeground.delete(agentId);
      if (
        attachment === "foreground"
        && (request.restoreParentOnExit ?? true)
        && agentProcess.exit
      ) {
        await this.options.foreground.restore(agentId, parent.agentId);
      }
    }
  }

  detach(agentId: string): void {
    this.detachForeground.get(agentId)?.();
  }
}
