import type { HarnessConfig, ThinkingLevel, VisionConfig } from "./types.js";
import type { MCPServerConfig } from "../mcp/types.js";

export class ConfigWatch {
  private listeners = new Set<(config: HarnessConfig) => void>();

  constructor(private config: HarnessConfig) {}

  /** Immutable snapshot (readonly type prevents accidental external mutation) */
  get(): Readonly<HarnessConfig> {
    return this.config;
  }

  /** Subscribe to config changes. Returns unsubscribe function. */
  onChange(fn: (config: HarnessConfig) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Set provider + modelId + thinkingLevel (typically change together) */
  setModelConfig(provider: string, modelId: string, thinkingLevel: ThinkingLevel): void {
    this.config.provider = provider;
    this.config.modelId = modelId;
    this.config.thinkingLevel = thinkingLevel;
    this.emit();
  }

  /** Set thinkingLevel only (does not change provider/modelId) */
  setThinkingLevel(level: ThinkingLevel): void {
    this.config.thinkingLevel = level;
    this.emit();
  }

  /** Set API key */
  setApiKey(key: string): void {
    this.config.apiKey = key;
    this.emit();
  }

  /** Set project path (triggers full session/memory/skills/MCP reload) */
  setProjectPath(path: string): void {
    this.config.projectPath = path;
    this.emit();
  }

  /** Set Vision config (full replacement) */
  setVision(vision: VisionConfig | undefined): void {
    this.config.vision = vision;
    this.emit();
  }

  /** Update Vision partial fields */
  updateVision(patch: Partial<VisionConfig>): void {
    this.config.vision = this.config.vision
      ? { ...this.config.vision, ...patch }
      : (patch as VisionConfig);
    this.emit();
  }

  /** Set MCP server list */
  setMcpServers(servers: MCPServerConfig[]): void {
    this.config.mcp = servers;
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) {
      fn(this.config);
    }
  }
}
