import type { Agent } from "@mariozechner/pi-agent-core";
import type { ImageContent } from "@mariozechner/pi-ai";

import type { ImageRef, SerializedSession, SessionMetadata, VisionMessage } from "../core/types.js";
import { ImageCache } from "../utils/image-cache.js";
import { SessionStore } from "./store.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

/**
 * Restore inline images from ImageRef[] for agent/frontend consumption.
 * Mutates the message in-place: removes `images` field and injects
 * ImageContent blocks back into `content`.
 */
async function restoreImagesFromCache(msg: any): Promise<void> {
  const refs = msg.images as any[] | undefined;
  if (!refs || refs.length === 0) return;

  const restored: ImageContent[] = [];
  for (const ref of refs) {
    // Handle inline format ({data, mimeType}) — directly convert to ImageContent
    if (ref.data && typeof ref.data === "string") {
      restored.push({ type: "image", data: ref.data, mimeType: ref.mimeType ?? "image/png" });
      continue;
    }
    // Handle ImageRef format ({type: "image_ref", hash, mimeType}) — restore from cache
    const cached = await ImageCache.get(ref);
    if (cached) {
      restored.push(cached);
    }
  }

  if (restored.length === 0) return;

  const content = Array.isArray(msg.content) ? msg.content : [{ type: "text", text: msg.content ?? "" }];
  msg.content = [...content, ...restored];
  delete msg.images;
}

export class SessionManager {
  private store: SessionStore;
  private current: SessionMetadata | null = null;
  private projectPath: string;
  private _visionMessages: VisionMessage[] = [];
  private accumulatedMs = 0;
  private activeSince: number | null = null;

  constructor(dataDir: string, projectPath: string) {
    this.projectPath = projectPath;
    this.store = new SessionStore(dataDir, projectPath);
  }

  get visionMessages(): VisionMessage[] {
    return this._visionMessages;
  }

  setVisionMessages(vms: VisionMessage[]): void {
    this._visionMessages = vms;
  }

  createSession(provider: string, modelId: string): SessionMetadata {
    // Reuse existing empty session if one exists (avoid zero-msg session accumulation)
    const existing = this.store.list().find((s) => s.messageCount === 0);
    if (existing) {
      this.current = {
        ...existing,
        updatedAt: Date.now(),
        modelProvider: provider,
        modelId,
        totalActiveMs: 0,
      };
      this.accumulatedMs = 0;
    } else {
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
        hasImages: false,
        imageCount: 0,
        totalActiveMs: 0,
      };
      this.accumulatedMs = 0;
    }
    this.activeSince = Date.now();
    this._visionMessages = [];
    return this.current;
  }

  persistEmptySession(): void {
    if (!this.current) return;
    // Deduplicate: delete other zero-message sessions in current project
    const emptySessions = this.store.list().filter(
      (s) => s.messageCount === 0 && s.id !== this.current!.id,
    );
    for (const s of emptySessions) {
      try { this.store.delete(s.id); } catch { /* best-effort */ }
    }
    const session: SerializedSession = {
      version: 1,
      metadata: this.current,
      messages: [],
    };
    this.store.save(session);
  }

  saveSession(agent: Agent, pendingPermission?: import("../core/types.js").PendingPermission): void {
    if (!this.current) return;
    const messages = agent.state.messages as any[];
    if (messages.length === 0) return;

    // Preserve pendingPermission in metadata only — don't touch messages.
    this.current.updatedAt = Date.now();
    this.current.messageCount = messages.filter((m: any) => m.role === "user" || m.role === "assistant").length;

    // Accumulate active time since last save
    if (this.activeSince !== null) {
      this.accumulatedMs += Date.now() - this.activeSince;
      this.activeSince = Date.now();
    }
    this.current.totalActiveMs = this.accumulatedMs;

    if (pendingPermission !== undefined) {
      this.current.pendingPermission = pendingPermission;
    }

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

    // Build serializable copy: convert inline image blocks to ImageRef references
    let totalImages = 0;
    let hasImages = false;
    const serializedMessages = messages.map((msg: any) => {
      const copy = { ...msg };
      if (!Array.isArray(copy.content)) return copy;

      const imageBlocks = copy.content.filter((b: any) => b.type === "image" && b.data);
      if (imageBlocks.length === 0) return copy;

      hasImages = true;
      totalImages += imageBlocks.length;

      // Cache images synchronously and store references instead of inline base64
      copy.images = imageBlocks.map((b: any) => {
        const ref = ImageCache.putSync({ type: "image", data: b.data, mimeType: b.mimeType ?? "image/png" });
        return { type: "image_ref" as const, hash: ref.hash, mimeType: ref.mimeType };
      });
      copy.content = copy.content.filter((b: any) => b.type !== "image");
      return copy;
    });

    this.current.hasImages = hasImages;
    this.current.imageCount = totalImages;

    const version: 1 | 2 = hasImages || this._visionMessages.length > 0 ? 2 : 1;

    const session: SerializedSession = {
      version,
      metadata: this.current,
      messages: serializedMessages as unknown[],
    };
    if (this._visionMessages.length > 0) {
      session.visionMessages = this._visionMessages;
    }
    this.store.save(session);
  }

  trySaveSession(agent: Agent, pendingPermission?: import("../core/types.js").PendingPermission): void {
    try {
      this.saveSession(agent, pendingPermission);
    } catch (err) {
      console.error("[session] trySaveSession failed:", err);
    }
  }

  async loadSession(id: string, agent: Agent): Promise<LoadResult> {
    try {
      const session = this.store.load(id);
      const messages = session.messages as any[];

      // Restore images from cache for any ImageRef entries
      for (const msg of messages) {
        await restoreImagesFromCache(msg);
      }

      // visionMessages preserved for display layer (display.ts).
      // agent.state.messages content stays as-is for model inference context.

      agent.state.messages = messages as any;
      this.current = session.metadata;
      this.accumulatedMs = session.metadata.totalActiveMs ?? 0;
      this.activeSince = Date.now();
      this._visionMessages = session.visionMessages ?? [];
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Unknown error loading session" };
    }
  }

  updateProjectPath(dataDir: string, projectPath: string): void {
    this.projectPath = projectPath;
    this.store = new SessionStore(dataDir, projectPath);
    if (this.current) {
      this.current.projectPath = projectPath;
    }
  }

  listSessions(): SessionMetadata[] {
    return this.store.list().filter((s) => s.messageCount > 0);
  }

  listAllSessions(): SessionMetadata[] {
    return this.store.listAll();
  }

  deleteSession(id: string): LoadResult {
    try {
      this.store.delete(id);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message ?? "Unknown error loading session" };
    }
  }

  /** Locate session file by full ID or prefix (minimum 8 characters). */
  getSessionFilePath(idOrPrefix: string): { path: string; metadata: SessionMetadata } | null {
    if (idOrPrefix.length < 8) return null;

    // Exact match first —— check project dir then global dir
    const projPath = join(this.store.projectDirPath(), `${idOrPrefix}.json`);
    const globalPath = join(this.store.globalDirPath(), `${idOrPrefix}.json`);

    for (const p of [projPath, globalPath]) {
      if (existsSync(p)) {
        try {
          const raw = JSON.parse(readFileSync(p, "utf8"));
          return { path: p, metadata: raw.metadata as SessionMetadata };
        } catch {
          return null;
        }
      }
    }

    // Prefix match: scan directories for files matching prefix
    const dirs = [
      this.store.projectDirPath(),
      this.store.globalDirPath(),
    ];
    for (const dir of dirs) {
      try {
        const files = readdirSync(dir).filter(
          (f) => f.endsWith(".json") && f !== "index.json" && f.startsWith(idOrPrefix),
        );
        if (files.length === 1) {
          const p = join(dir, files[0]);
          try {
            const raw = JSON.parse(readFileSync(p, "utf8"));
            return { path: p, metadata: raw.metadata as SessionMetadata };
          } catch {
            return null;
          }
        }
        if (files.length > 1) return null; // ambiguous
      } catch {
        // directory may not exist
      }
    }

    return null;
  }

  getCurrentSessionId(): string | null {
    return this.current?.id ?? null;
  }

  async loadSessionFile(sessionId: string): Promise<SerializedSession | null> {
    return this.store.loadSessionFile(sessionId);
  }

  /** Total active time in milliseconds (accumulated across switches). */
  getTotalActiveMs(): number {
    if (this.activeSince === null) return this.accumulatedMs;
    return this.accumulatedMs + (Date.now() - this.activeSince);
  }

  getCurrentMetadata(): SessionMetadata | null {
    return this.current;
  }
}
