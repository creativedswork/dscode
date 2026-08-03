import { randomUUID } from "node:crypto";

import type { HarnessEventBus } from "../../core/events.js";
import type { Logger } from "../../utils/logger.js";
import type { AgentApplicationRegistry } from "../application/registry.js";
import type { AgentApplicationSnapshot } from "../application/types.js";
import type { AgentProcessRuntime } from "../runtimes/runtime.js";
import { deriveAgentContext } from "./context.js";
import { ContextAssembler } from "./context-selection.js";
import { AgentExecutionController } from "./execution-controller.js";
import type { AgentFallbackRegistry } from "./fallback.js";
import { AgentProcessLifecycle } from "./lifecycle.js";
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

export class AgentSupervisor {
  private readonly processes = new Map<string, AgentProcess>();
  private readonly worktrees = new AgentWorktreeManager();
  private readonly lifecycle: AgentProcessLifecycle;
  private readonly executionController: AgentExecutionController;
  private readonly contextAssembler = new ContextAssembler();
  private readonly detachForeground = new Map<string, () => void>();

  constructor(
    private readonly registry: AgentApplicationRegistry,
    private readonly runtimeFactory: AgentRuntimeFactory,
    store: AgentProcessStore,
    private readonly events: HarnessEventBus,
    logger: Logger,
    private readonly availableTools: () => readonly string[],
    private readonly maxDepth = 1,
    fallbackRegistry?: AgentFallbackRegistry,
  ) {
    this.lifecycle = new AgentProcessLifecycle(store, events, logger, this.worktrees);
    this.executionController = new AgentExecutionController({
      transition: (agentProcess, state) => this.lifecycle.transition(agentProcess, state),
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
      contextMode: "minimal",
      context: processContext,
      runtime,
      createdAt: Date.now(),
      startedAt: Date.now(),
    };
    this.processes.set(agentProcess.agentId, agentProcess);
    void this.lifecycle.persist(agentProcess);
    this.events.emit({
      type: "agent:spawned",
      agentId: agentProcess.agentId,
      application: application.name,
      attachment: "foreground",
    });
    return agentProcess;
  }

  async spawn(options: SpawnAgentRequest): Promise<SpawnAgentResult> {
    const parent = this.require(options.parentAgentId);
    const application = this.registry.require(options.application);
    const contextMode = options.contextMode ?? "minimal";
    if (contextMode === "selected" && !options.contextSelection?.items.length) {
      throw new Error("contextMode=selected requires a non-empty contextSelection");
    }
    if (contextMode !== "selected" && options.contextSelection) {
      throw new Error(`contextSelection is not valid with contextMode=${contextMode}`);
    }
    if (contextMode === "fork") {
      throw new Error("contextMode=fork is disabled until its evaluation gate passes");
    }
    const contextSelection = options.contextSelection
      ? await this.contextAssembler.assemble(options.contextSelection, parent)
      : undefined;
    const attachment = options.attachment ?? (application.background ? "background" : "foreground");
    const agentId = `agent-${randomUUID()}`;
    const baseContext = deriveAgentContext({
      application,
      parent: parent.context,
      availableTools: this.availableTools(),
      attachment,
      cwd: options.cwd,
      maxDepth: this.maxDepth,
    });
    const worktree = application.isolation === "worktree"
      ? await this.worktrees.create(baseContext.cwd, agentId)
      : undefined;
    const context = Object.freeze({
      ...baseContext,
      agentId,
      cwd: worktree?.path ?? baseContext.cwd,
      worktree,
    });
    let runtime: AgentProcessRuntime;
    try {
      runtime = this.runtimeFactory(application, context, agentId);
    } catch (error) {
      if (worktree) await this.worktrees.finalize(worktree);
      throw error;
    }
    const agentProcess: AgentProcess = {
      agentId,
      parentAgentId: parent.agentId,
      parentSessionId: parent.parentSessionId,
      application,
      role: "subagent",
      state: "created",
      attachment,
      contextMode,
      contextSelection,
      context,
      runtime,
      createdAt: Date.now(),
    };
    this.processes.set(agentId, agentProcess);
    await this.lifecycle.persist(agentProcess);
    this.events.emit({
      type: "agent:spawned",
      agentId,
      parentAgentId: parent.agentId,
      application: application.name,
      attachment,
    });
    options.onSpawn?.(agentId);

    const execution = this.executionController.start(agentProcess, {
      prompt: contextSelection
        ? `${contextSelection.content}\n\n${options.input.prompt}`
        : options.input.prompt,
      attachments: options.input.attachments,
    });
    let removeAbortListener = () => {};
    if (options.signal) {
      const onAbort = () => {
        void this.terminate(agentId);
      };
      removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
      options.signal.addEventListener("abort", onAbort, { once: true });
      void execution.finally(removeAbortListener);
      if (options.signal.aborted) onAbort();
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
    }
  }

  list(parentAgentId?: string): AgentProcess[] {
    return [...this.processes.values()]
      .filter((agentProcess) => !parentAgentId || agentProcess.parentAgentId === parentAgentId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  get(agentId: string): AgentProcess | undefined {
    return this.processes.get(agentId);
  }

  async updateParentSession(agentId: string, sessionId: string, cwd?: string): Promise<void> {
    const agentProcess = this.require(agentId);
    agentProcess.parentSessionId = sessionId;
    agentProcess.context = Object.freeze({
      ...agentProcess.context,
      parentSessionId: sessionId,
      cwd: cwd ?? agentProcess.context.cwd,
    });
    await this.lifecycle.persist(agentProcess);
  }

  require(agentId: string): AgentProcess {
    const agentProcess = this.get(agentId);
    if (!agentProcess) throw new Error(`Unknown Agent process: ${agentId}`);
    return agentProcess;
  }

  async wait(agentId: string): Promise<AgentExitResult> {
    return this.executionController.wait(this.require(agentId));
  }

  async terminate(agentId: string): Promise<AgentExitResult> {
    return this.executionController.terminate(this.require(agentId));
  }

  async kill(agentId: string): Promise<AgentExitResult> {
    return this.executionController.kill(this.require(agentId));
  }

  async suspend(agentId: string): Promise<void> {
    const agentProcess = this.require(agentId);
    if (!agentProcess.runtime.capabilities.suspend || !agentProcess.runtime.suspend) {
      throw new Error(`Agent process ${agentId} does not support suspend`);
    }
    await agentProcess.runtime.suspend();
    await this.lifecycle.transition(agentProcess, "stopped");
  }

  async continue(agentId: string): Promise<void> {
    const agentProcess = this.require(agentId);
    if (!agentProcess.runtime.capabilities.suspend || !agentProcess.runtime.continue) {
      throw new Error(`Agent process ${agentId} does not support continue`);
    }
    await agentProcess.runtime.continue();
    await this.lifecycle.transition(agentProcess, "running");
  }

  sendMessage(agentId: string, content: string): void {
    const agentProcess = this.require(agentId);
    if (!["running", "stopped"].includes(agentProcess.state)) {
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
    this.detachForeground.get(agentId)?.();
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
