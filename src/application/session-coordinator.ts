import type { Agent } from "@earendil-works/pi-agent-core";

import type { AgentSupervisor } from "../agents/process/supervisor.js";
import type {
  AgentExitResult,
  AgentProcess,
} from "../agents/process/types.js";
import type { HarnessEvent } from "../application/events.js";
import type { Logger } from "../kernel/logger.js";
import type { SessionManager } from "../session/manager.js";
import type {
  SwitchSessionRequest,
  SwitchSessionResult,
} from "../session/types.js";
import type { ConversationCoordinator } from "./conversation-coordinator.js";

export interface SessionCoordinatorOptions {
  sessionManager: SessionManager;
  agentSupervisor(): AgentSupervisor;
  mainAgentId(): string;
  agent(): Agent;
  projectPath(): string;
  abort(): void;
  conversation: ConversationCoordinator;
  logger: Logger;
  isShuttingDown?(): boolean;
  resumeNotifications?(notifications: AgentExitResult[]): Promise<void>;
  publish?(event: HarnessEvent): void;
}

export class SessionCoordinator {
  private autoSaveTimer: NodeJS.Timeout | undefined;
  private lastSavedMessageCount = 0;
  private readonly pendingBackgroundSessions = new Set<string>();
  private backgroundDrain: Promise<void> | null = null;

  constructor(private readonly options: SessionCoordinatorOptions) {}

  async switch(request: SwitchSessionRequest): Promise<SwitchSessionResult> {
    const {
      conversation,
      sessionManager,
    } = this.options;
    conversation.beginTransition("session");
    try {
      const targetId = this.resolveSessionId(request.sessionIdOrPrefix);
      const prepared = await sessionManager.prepareLoad(targetId);

      await conversation.quiesce(this.options.abort);
      sessionManager.saveSession(this.options.agent(), request.pendingPermission);
      await this.options.agentSupervisor().updateParentSession(
        this.options.mainAgentId(),
        targetId,
        this.options.projectPath(),
      );
      sessionManager.commitPreparedLoad(prepared, this.options.agent());
      this.lastSavedMessageCount = prepared.messages.length;

      return {
        session: prepared.metadata,
        messages: prepared.messages,
        agentMessages: prepared.agentMessages,
      };
    } finally {
      conversation.endTransition("session");
      this.startBackgroundDrain();
    }
  }

  saveNow(): void {
    const agent = this.options.agent();
    this.options.sessionManager.trySaveSession(agent);
    this.lastSavedMessageCount = agent.state.messages.length;
  }

  startAutoSave(intervalMs = 15_000): void {
    if (this.autoSaveTimer) return;
    this.autoSaveTimer = setInterval(() => {
      const agent = this.options.agent();
      const currentCount = agent.state.messages.length;
      if (currentCount === this.lastSavedMessageCount) return;
      this.options.logger.info(
        "AutoSave",
        `Periodic auto-save (${currentCount} messages, was ${this.lastSavedMessageCount})`,
      );
      this.options.sessionManager.trySaveSession(agent);
      this.lastSavedMessageCount = currentCount;
    }, intervalMs);
    this.autoSaveTimer.unref();
  }

  stopAutoSave(): void {
    if (!this.autoSaveTimer) return;
    clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = undefined;
  }

  noteSavedMessageCount(): void {
    this.lastSavedMessageCount = this.options.agent().state.messages.length;
  }

  scheduleBackgroundProcess(process: AgentProcess | undefined): void {
    if (
      !process
      || process.role !== "subagent"
      || process.recording !== "session"
      || process.attachment !== "background"
      || !process.exit
    ) return;
    this.pendingBackgroundSessions.add(process.parentSessionId);
    this.startBackgroundDrain();
  }

  private startBackgroundDrain(): void {
    if (
      this.backgroundDrain
      || this.options.isShuttingDown?.()
      || this.options.conversation.isTransitioning
      || this.pendingBackgroundSessions.size === 0
      || !this.options.resumeNotifications
    ) return;

    let drain: Promise<void>;
    drain = Promise.resolve()
      .then(() => this.drainBackgroundSessions())
      .finally(() => {
        if (this.backgroundDrain === drain) this.backgroundDrain = null;
        const current = this.options.sessionManager.getCurrentSessionId();
        if (
          !this.options.isShuttingDown?.()
          && !this.options.conversation.isTransitioning
          && current
          && this.pendingBackgroundSessions.has(current)
        ) {
          this.startBackgroundDrain();
        }
      });
    this.backgroundDrain = drain;
  }

  private async drainBackgroundSessions(): Promise<void> {
    const {
      conversation,
      sessionManager,
    } = this.options;
    while (
      !this.options.isShuttingDown?.()
      && !conversation.isTransitioning
    ) {
      const sessionId = sessionManager.getCurrentSessionId();
      if (!sessionId || !this.pendingBackgroundSessions.has(sessionId)) return;

      if (conversation.currentTurn) {
        try {
          await conversation.currentTurn;
        } catch {
          // Failed turns still leave background notifications pending.
        }
        continue;
      }
      if (
        conversation.isTransitioning
        || sessionManager.getCurrentSessionId() !== sessionId
      ) continue;

      const notifications = this.options.agentSupervisor()
        .consumeNotifications(sessionId);
      this.pendingBackgroundSessions.delete(sessionId);
      if (notifications.length === 0) continue;

      this.options.publish?.({ type: "processing:start" });
      try {
        await conversation.run(
          () => this.options.resumeNotifications!(notifications),
        );
      } catch (error) {
        this.options.logger.error(
          "AgentContinuation",
          `Failed to resume Main Agent: ${String(error)}`,
        );
        this.options.publish?.({
          type: "ui:error",
          text: `Failed to resume after SubAgent completion: ${String(error)}`,
        });
        this.options.publish?.({ type: "processing:stop" });
      }
    }
  }

  private resolveSessionId(idOrPrefix: string): string {
    const normalized = idOrPrefix.trim();
    if (!normalized) throw new Error("Session ID required");

    const manager = this.options.sessionManager;
    const current = manager.getCurrentMetadata();
    const candidates = new Map(
      [
        ...manager.listSessions(),
        ...manager.listAllSessions(),
        ...(current ? [current] : []),
      ].map((session) => [session.id, session]),
    );
    if (candidates.has(normalized)) return normalized;

    const matches = [...candidates.values()].filter((session) =>
      session.id.startsWith(normalized)
    );
    if (matches.length === 0) {
      throw new Error(`Session not found: ${normalized}`);
    }
    if (matches.length > 1) {
      const details = matches
        .map((session) =>
          `  ${session.id.slice(0, 8)} "${session.title.slice(0, 60)}"`
        )
        .join("\n");
      throw new Error(
        `Ambiguous session ID prefix. Matching sessions:\n${details}`,
      );
    }
    return matches[0].id;
  }
}
