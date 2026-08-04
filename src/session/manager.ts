import type { Agent as PiAgentRuntime } from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";

import type {
  AgentSessionMessage,
  PreparedSessionLoad,
  SerializedSession,
  SessionMetadata,
  VisionMessage,
} from "../core/types.js";
import { ImageCache } from "../utils/image-cache.js";
import { SessionStore } from "./store.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { HarnessEventBus } from "../core/events.js";
import type { Logger } from "../utils/logger.js";

export interface LoadResult {
  success: boolean;
  error?: string;
}

function ulid(): string {
  const t = Date.now().toString(36).padStart(10, "0");
  const r = Array.from({ length: 16 }, () => Math.random().toString(36)[2]).join("");
  return (t + r).toUpperCase().slice(0, 26);
}

function migrateVisionMessages(messages: VisionMessage[]): AgentSessionMessage[] {
  return messages.map((message) => ({
    role: "subagent",
    agentId: `legacy-vision-${message.turnIndex}-${message.timestamp}`,
    application: "vision",
    state: "completed",
    input: {
      prompt: message.prompt,
      attachments: message.images.map((data) => ({ type: "image" as const, data })),
    },
    output: {
      text: message.description,
      source: "vision",
    },
    messageIndex: message.messageIndex,
    createdAt: message.timestamp,
    endedAt: message.timestamp,
  }));
}

function sessionAgentMessages(session: SerializedSession): AgentSessionMessage[] {
  return [
    ...(session.agentMessages ?? []),
    ...migrateVisionMessages(session.visionMessages ?? []),
  ];
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

// Regex to match slash commands like /opsx:propose, /opsx:apply, or /help
const SLASH_COMMAND_RE = /^\/[a-zA-Z][a-zA-Z0-9_:-]*\s*/;

// Messages matching these patterns are not useful as session titles
const NOISE_PATTERNS: RegExp[] = [
  /^(thanks|thank you|thx|ok|okay|yes|no|hi|hello|hey|good|great|nice|cool)[!.\s]*$/i,
  /^[谢谢好的嗯哦啊哈嘿嗨]+$/,
  /^[.,!?;:]+$/,
];

const MIN_TITLE_LENGTH = 10;

function extractText(msg: any): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlock = content.find((b: any) => b.type === "text");
    return textBlock?.text ?? "";
  }
  return "";
}

function isCommandMessage(text: string): boolean {
  return SLASH_COMMAND_RE.test(text);
}

function stripCommandPrefix(text: string): string {
  return text.replace(SLASH_COMMAND_RE, "").trim();
}

function isNoiseMessage(text: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(text));
}

// When a custom command (e.g. /opsx:explore) injects a large instruction body,
// the caller can set the user's actual input as the title intent.
// Unlike a transient hint, titleIntent persists across multiple saveSession
// calls and is only cleared when Pass 1 finds a real non-command human message.
let titleIntent: string | null = null;

export function setTitleIntent(intent: string): void {
  titleIntent = intent;
}
function extractSessionTitle(messages: any[]): string {
  // titleIntent takes priority — persists across saveSession calls.
  // Only setTitleIntent() modifies it; never cleared here.
  if (titleIntent && titleIntent.length >= MIN_TITLE_LENGTH) {
    return titleIntent.slice(0, 60);
  }

  // Pass 1: reverse scan — prefer the last qualifying non-command user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = extractText(msg);
    if (!text) continue;
    if (isCommandMessage(text)) continue;
    if (isNoiseMessage(text)) continue;
    if (text.length < MIN_TITLE_LENGTH) continue;
    return text.slice(0, 60);
  }

  // Pass 2: reverse scan — use last command's argument if meaningful
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = extractText(msg);
    if (!text) continue;
    if (!isCommandMessage(text)) continue;
    const arg = stripCommandPrefix(text);
    if (arg.length >= MIN_TITLE_LENGTH) {
      return arg.slice(0, 60);
    }
  }

  // Pass 3: fallback — any non-noise user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const text = extractText(msg);
    if (!text) continue;
    if (isNoiseMessage(text)) continue;
    const stripped = stripCommandPrefix(text);
    if (stripped) return stripped.slice(0, 60);
    return text.slice(0, 60);
  }

  return "New session";
}

function isTitleBetter(current: string, candidate: string): boolean {
  // Always replace placeholder
  if (!current || current === "New session") return true;

  // candidate is a truncated prefix of current — keep the longer title
  if (candidate.length < current.length && current.startsWith(candidate)) return false;
  return true;
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
  private logger: Logger;
  private store: SessionStore;
  private current: SessionMetadata | null = null;
  private projectPath: string;
  private _agentMessages: AgentSessionMessage[] = [];
  private _legacyVisionMessages: VisionMessage[] = [];
  private accumulatedMs = 0;
  private activeSince: number | null = null;

  constructor(dataDir: string, projectPath: string, logger: Logger) {
    this.logger = logger;
    this.projectPath = projectPath;
    this.store = new SessionStore(dataDir, projectPath);
  }

  get agentMessages(): AgentSessionMessage[] {
    return [
      ...this._agentMessages,
      ...migrateVisionMessages(this._legacyVisionMessages),
    ];
  }

  setAgentMessages(messages: AgentSessionMessage[]): void {
    this._agentMessages = messages;
    this._legacyVisionMessages = [];
  }

  upsertAgentMessage(sessionId: string, message: AgentSessionMessage): void {
    if (this.current?.id === sessionId) {
      this._agentMessages = [
        ...this._agentMessages.filter((item) => item.agentId !== message.agentId),
        message,
      ];
      return;
    }
    const session = this.store.load(sessionId);
    session.version = 3;
    session.agentMessages = [
      ...sessionAgentMessages(session).filter((item) => item.agentId !== message.agentId),
      message,
    ];
    delete session.visionMessages;
    this.store.save(session);
    this.events?.emit({ type: "session:saved", id: sessionId });
  }

  appendVisionMessage(sessionId: string, message: VisionMessage): void {
    if (this.current?.id === sessionId) {
      this._legacyVisionMessages = [...this._legacyVisionMessages, message];
      return;
    }
    const session = this.store.load(sessionId);
    session.version = 2;
    session.visionMessages = [...(session.visionMessages ?? []), message];
    this.store.save(session);
    this.events?.emit({ type: "session:saved", id: sessionId });
  }

  /** Subscribe to event bus for autonomous timer management and emit session lifecycle events. */
  bindEvents(events: HarnessEventBus): void {
    this.events = events;
    events.on("turn:start", () => { this.stopActiveTimer(); this.startActiveTimer(); });
    events.on("processing:stop", () => { this.stopActiveTimer(); });
  }

  private events?: HarnessEventBus;

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
        contentHash: "",
        totalActiveMs: 0,
      };
      this.accumulatedMs = 0;
    }
    this._agentMessages = [];
    this._legacyVisionMessages = [];
    this.events?.emit({ type: "session:created", id: this.current.id });
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
    this.events?.emit({ type: "session:saved", id: this.current!.id });
  }

  saveSession(agent: PiAgentRuntime, pendingPermission?: import("../core/types.js").PendingPermission): void {
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

    // Extract title from conversation — strips commands, prefers substantive messages
    const candidate = extractSessionTitle(messages);
    if (isTitleBetter(this.current.title, candidate)) {
      this.current.title = candidate;
    }


    if (!this.current.preview) {
      this.current.preview = extractFirstUserMessage(messages as unknown[]);
    }
    // Compute content hash for dashboard cache invalidation
    const contentHash = createHash("sha256")
      .update(messages.map((m: any) => `${m.role}:${String(m.content ?? "").slice(0, 200)}`).join("|"))
      .digest("hex")
      .slice(0, 12);
    this.current.contentHash = contentHash;

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

    const version: 1 | 2 | 3 = this._agentMessages.length > 0
      ? 3
      : hasImages || this._legacyVisionMessages.length > 0
        ? 2
        : 1;

    const session: SerializedSession = {
      version,
      metadata: this.current,
      messages: serializedMessages as unknown[],
    };
    if (this._agentMessages.length > 0) {
      session.agentMessages = this._agentMessages;
    }
    if (this._legacyVisionMessages.length > 0) {
      session.visionMessages = this._legacyVisionMessages;
    }
    this.store.save(session);
    this.events?.emit({ type: "session:saved", id: this.current!.id });
  }

  trySaveSession(agent: PiAgentRuntime, pendingPermission?: import("../core/types.js").PendingPermission): void {
    try {
      this.saveSession(agent, pendingPermission);
    } catch (err) {
      this.logger.error("Save", `trySaveSession failed: ${String(err)}`);
    }
  }

  async prepareLoad(id: string): Promise<PreparedSessionLoad> {
    const session = this.store.load(id);
    const messages = session.messages as any[];

    for (const message of messages) {
      await restoreImagesFromCache(message);
    }

    return {
      id,
      metadata: session.metadata,
      messages,
      agentMessages: sessionAgentMessages(session),
    };
  }

  commitPreparedLoad(prepared: PreparedSessionLoad, agent: PiAgentRuntime): void {
    // SubAgent records remain display/audit metadata and never enter model context.
    agent.state.messages = prepared.messages as any;
    this.current = prepared.metadata;
    this.accumulatedMs = prepared.metadata.totalActiveMs ?? 0;
    this._agentMessages = prepared.agentMessages;
    this._legacyVisionMessages = [];
    this.events?.emit({ type: "session:loaded", id: prepared.id });
  }

  async loadSession(id: string, agent: PiAgentRuntime): Promise<LoadResult> {
    try {
      const prepared = await this.prepareLoad(id);
      this.commitPreparedLoad(prepared, agent);
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
      if (id === this.current?.id) this.current = null;
      this.events?.emit({ type: "session:deleted", id });
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

  startActiveTimer(): void {
    if (this.activeSince === null) {
      this.activeSince = Date.now();
    }
  }

  stopActiveTimer(): void {
    if (this.activeSince !== null) {
      this.accumulatedMs += Date.now() - this.activeSince;
      this.activeSince = null;
      if (this.current) {
        this.current.totalActiveMs = this.accumulatedMs;
      }
    }
  }

  getCurrentMetadata(): SessionMetadata | null {
    return this.current;
  }
}
