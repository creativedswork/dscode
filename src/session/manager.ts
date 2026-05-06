import type { Agent } from "@mariozechner/pi-agent-core";

import type { SerializedSession, SessionMetadata } from "../core/types.js";
import { SessionStore } from "./store.js";

function ulid(): string {
  const t = Date.now().toString(36).padStart(10, "0");
  const r = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join("");
  return (t + r).toUpperCase().slice(0, 26);
}

export class SessionManager {
  private store: SessionStore;
  private current: SessionMetadata | null = null;

  constructor(dataDir: string) {
    this.store = new SessionStore(dataDir);
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
    };
    return this.current;
  }

  saveSession(agent: Agent): void {
    if (!this.current) return;

    const messages = agent.state.messages;
    this.current.updatedAt = Date.now();
    this.current.messageCount = messages.length;

    if (messages.length > 0 && this.current.title === "New session") {
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

    const session: SerializedSession = {
      version: 1,
      metadata: this.current,
      messages: messages as unknown[],
    };
    this.store.save(session);
  }

  loadSession(id: string, agent: Agent): boolean {
    const session = this.store.load(id);
    if (!session) return false;
    agent.state.messages = session.messages as any;
    this.current = session.metadata;
    return true;
  }

  listSessions(): SessionMetadata[] {
    return this.store.list();
  }

  deleteSession(id: string): void {
    this.store.delete(id);
  }

  getCurrentSessionId(): string | null {
    return this.current?.id ?? null;
  }

  getCurrentMetadata(): SessionMetadata | null {
    return this.current;
  }
}
