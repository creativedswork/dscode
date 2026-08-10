import type { HarnessEventBus } from "../../application/events.js";
import type { Logger } from "../../kernel/logger.js";
import type {
  AgentProcessProgress,
  AgentRuntimeSnapshot,
} from "../runtimes/runtime.js";
import type { AgentProcessStore } from "./store.js";
import type {
  AgentExitResult,
  AgentProcess,
  AgentProcessState,
} from "./types.js";
import type { AgentWorktreeManager } from "./worktree.js";

export class AgentProcessLifecycle {
  private readonly notifications = new Map<string, AgentExitResult[]>();

  constructor(
    private readonly store: AgentProcessStore,
    private readonly events: HarnessEventBus,
    private readonly logger: Logger,
    private readonly worktrees: AgentWorktreeManager,
  ) {}

  output(agentProcess: AgentProcess, text: string): void {
    this.events.emit({ type: "agent:output", agentId: agentProcess.agentId, text });
  }

  progress(agentProcess: AgentProcess, progress: AgentProcessProgress): void {
    this.events.emit({
      type: "agent:progress",
      agentId: agentProcess.agentId,
      ...progress,
    });
  }

  async checkpoint(
    agentProcess: AgentProcess,
    snapshot: AgentRuntimeSnapshot,
  ): Promise<void> {
    agentProcess.runtimeSnapshot = snapshot;
    await this.persist(agentProcess);
  }

  async finish(
    agentProcess: AgentProcess,
    state: AgentExitResult["state"],
    output?: string,
    details?: unknown,
    error?: string,
  ): Promise<AgentExitResult> {
    const finalDetails = await this.finalizeWorktree(agentProcess, details);
    const endedAt = Date.now();
    const exit: AgentExitResult = {
      agentId: agentProcess.agentId,
      state,
      output,
      details: finalDetails,
      error,
      startedAt: agentProcess.startedAt ?? agentProcess.createdAt,
      endedAt,
    };
    const previous = agentProcess.state;
    agentProcess.state = state;
    agentProcess.endedAt = endedAt;
    agentProcess.exit = exit;
    agentProcess.runtimeSnapshot = agentProcess.runtime.snapshot?.();
    if (agentProcess.attachment === "background") {
      const pending = this.notifications.get(agentProcess.parentSessionId) ?? [];
      pending.push(exit);
      this.notifications.set(agentProcess.parentSessionId, pending);
    }
    await this.persist(agentProcess);
    this.events.emit({ type: "agent:state", agentId: agentProcess.agentId, previous, state });
    this.events.emit({ type: "agent:exit", result: exit });
    return exit;
  }

  async transition(agentProcess: AgentProcess, state: AgentProcessState): Promise<void> {
    const previous = agentProcess.state;
    if (previous === state) return;
    agentProcess.state = state;
    await this.persist(agentProcess);
    this.events.emit({ type: "agent:state", agentId: agentProcess.agentId, previous, state });
  }

  consumeNotifications(sessionId: string): AgentExitResult[] {
    const pending = this.notifications.get(sessionId) ?? [];
    this.notifications.delete(sessionId);
    return pending;
  }

  async persist(agentProcess: AgentProcess): Promise<void> {
    try {
      await this.store.save(agentProcess);
    } catch (error) {
      this.logger.error("AgentProcessStore", String(error));
    }
  }

  async persistRequired(agentProcess: AgentProcess): Promise<void> {
    await this.store.save(agentProcess);
  }

  private async finalizeWorktree(agentProcess: AgentProcess, details: unknown): Promise<unknown> {
    if (!agentProcess.context.worktree) return details;
    try {
      const worktree = await this.worktrees.finalize(agentProcess.context.worktree);
      const base = details && typeof details === "object"
        ? details as Record<string, unknown>
        : { value: details };
      return { ...base, worktree };
    } catch (error) {
      this.logger.error("AgentWorktree", String(error));
      return details;
    }
  }
}
