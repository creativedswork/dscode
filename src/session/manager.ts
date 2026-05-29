import type { Agent } from "@mariozechner/pi-agent-core";

import type { SerializedSession, SessionMetadata } from "../core/types.js";
import { SessionStore } from "./store.js";

export interface LoadResult {
  success: boolean;
  error?: string;
}

function ulid(): string {
  const t = Date.now().toString(36).padStart(10, "0");
  const r = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join("");
  return (t + r).toUpperCase().slice(0, 26);
}

function extractFirstUserMessage(messages: unknown[]): string {
  for (const msg of messages) {
    const m = msg as any;
    if (m.role !== "user") continue;
    const content = m.content;
    if (typeof content === "string") return content.slice(0, 80);
    if (Array.isArray(content)) {
      const textBlock = content.find((b: any) => b.type === "text");
      if (textBlock) return textBlock.text.slice(0, 80);
    }
  }
  return "";
}

export class SessionManager {
  private store: SessionStore;
  private current: SessionMetadata | null = null;
  private projectPath: string;

  constructor(dataDir: string, projectPath: string) {
    this.projectPath = projectPath;
    this.store = new SessionStore(dataDir, projectPath);
  }

  createSession(provider: string, modelId: string): SessionMetadata {
    this.current = {
      id: ulid(),
      title: "New session",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelProvider: provider,
      modelId,
      messageCount: 0,
      projectPath: this.projectPath,
      preview: "",
    };
    return this.current;
  }

  saveSession(agent: Agent): void {
    if (!this.current) return;
    const messages = agent.state.messages;
    // Never overwrite a session file with empty messages.
    // This can happen when saveSession is called after agent.reset()
    // (e.g. from agent_end error handler or promptAndSave finally block).
    if (messages.length === 0) return;

    this.current.updatedAt = Date.now();
    this.current.messageCount = messages.filter((m: any) => m.role === "user" || m.role === "assistant").length;

    if (this.current.title === "New session") {
      const first = messages[0];
      const content = (first as any)?.content;
      if (Array.isArray(content)) {
        const textBlock = content.find((b: any) => b.type === "text");
        if (textBlock) {
          this.current.title = textBlock.text.slice(0, 60);
        }
      } else if (typeof content === "string") {
        this.current.title = content.slice(0, 60);
      }
    }

    if (!this.current.preview) {
      this.current.preview = extractFirstUserMessage(messages as unknown[]);
    }

    this.current.projectPath = this.projectPath;

    const session: SerializedSession = {
      version: 1,
      metadata: this.current,
      messages: messages as unknown[],
    };
    this.store.save(session);
  }

  trySaveSession(agent: Agent): void {
    try {
      this.saveSession(agent);
    } catch (err) {
      console.error("[session] trySaveSession failed:", err);
    }
  }

  loadSession(id: string, agent: Agent): LoadResult {
    try {
      const session = this.store.load(id);
      agent.state.messages = session.messages as any;
      this.current = session.metadata;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Unknown error loading session" };
    }
  }

  listSessions(): SessionMetadata[] {
    return this.store.list();
  }

  listAllSessions(): SessionMetadata[] {
    return this.store.listAll();
  }

  deleteSession(id: string): LoadResult {
    try {
      this.store.delete(id);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Unknown error deleting session" };
    }
  }

  getCurrentSessionId(): string | null {
    return this.current?.id ?? null;
  }

  getCurrentMetadata(): SessionMetadata | null {
    return this.current;
  }
}
