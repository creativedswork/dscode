import type { ContextConfig } from "../core/types.js";
import { estimateMessagesTokens, estimateTokens } from "./estimator.js";
import { dropOldest, slidingWindow } from "./compaction.js";

export type UsageCategory =
  | "system"
  | "rules"
  | "user"
  | "thinking"
  | "readwrite"
  | "edit"
  | "shell"
  | "skill"
  | "mcp"
  | "other";

export class ContextManager {
  private config: ContextConfig;
  private contextWindow: number = 128000;
  private maxTokens: number = 8192;

  constructor(config: ContextConfig) {
    this.config = config;
  }

  updateModel(contextWindow: number, maxTokens: number): void {
    this.contextWindow = contextWindow;
    this.maxTokens = maxTokens;
  }

  async transform(messages: unknown[], _signal?: AbortSignal): Promise<unknown[]> {
    const budget = this.getAvailableBudget();
    const estimated = estimateMessagesTokens(messages);

    if (estimated <= budget * this.config.targetUtilization) {
      return messages as any;
    }

    switch (this.config.strategy) {
      case "drop-oldest":
        return dropOldest(messages, budget, this.config.minRetainedMessages) as any;
      case "sliding-window":
        return slidingWindow(messages, this.config.minRetainedMessages * 4) as any;
      case "summarize-prefix":
        // fallback to sliding-window (summarize requires extra LLM call)
        return slidingWindow(messages, this.config.minRetainedMessages * 4) as any;
      default:
        return messages as any;
    }
  }

  private getAvailableBudget(): number {
    const reservedSystem = 2000;
    const reservedTools = 3000;
    return this.contextWindow - this.maxTokens - reservedSystem - reservedTools;
  }

  getContextWindow(): number {
    return this.contextWindow;
  }

  classifyToolCategory(toolName: string, skillNames?: Set<string>): UsageCategory {
    if (toolName.startsWith("mcp__")) return "mcp";
    if (skillNames?.has(toolName)) return "skill";
    if (
      toolName === "read_file" ||
      toolName === "list_files" ||
      toolName === "grep" ||
      toolName === "glob" ||
      toolName === "write_file" ||
      toolName === "overwrite_file"
    )
      return "readwrite";
    if (toolName === "edit" || toolName === "edit_undo") return "edit";
    if (toolName === "bash") return "shell";
    return "other";
  }

  getCategoryBreakdown(
    messages: unknown[],
    tools: { name: string; result: string }[],
    skillNames?: Set<string>,
  ): {
    total: number;
    used: number;
    free: number;
    categories: Record<UsageCategory, number>;
  } {
    const categories: Record<UsageCategory, number> = {
      system: 0,
      rules: 0,
      user: 0,
      thinking: 0,
      readwrite: 0,
      edit: 0,
      shell: 0,
      skill: 0,
      mcp: 0,
      other: 0,
    };

    let systemMsgIndex = 0;

    // Classify messages
    for (const msg of messages) {
      const m = msg as any;
      const role = m?.role as string | undefined;
      const content = m?.content;

      if (role === "system") {
        systemMsgIndex++;
        const target = systemMsgIndex === 1 ? "system" : "rules";
        if (typeof content === "string") {
          categories[target] += estimateTokens(content);
          categories[target] += 4; // framing
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "text" && typeof block.text === "string") {
              categories[target] += estimateTokens(block.text);
            }
          }
          categories[target] += 4;
        }
      } else if (role === "user") {
        if (typeof content === "string") {
          categories.user += estimateTokens(content);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "text" && typeof block.text === "string") {
              categories.user += estimateTokens(block.text);
            }
          }
        }
        categories.user += 4;
      } else if (role === "assistant") {
        // Raw agent messages use OpenAI format: content is an array of blocks
        if (typeof content === "string") {
          categories.thinking += estimateTokens(content);
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "text" && typeof block.text === "string") {
              categories.thinking += estimateTokens(block.text);
            } else if (block?.type === "thinking" && typeof block.thinking === "string") {
              categories.thinking += estimateTokens(block.thinking);
            }
          }
        }
        categories.thinking += 4;
      } else if (role === "toolResult") {
        const toolName = (m?.toolName as string) ?? "";
        const cat = this.classifyToolCategory(toolName, skillNames);
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "text" && typeof block.text === "string") {
              categories[cat] += estimateTokens(block.text);
            }
          }
        } else if (typeof content === "string") {
          categories[cat] += estimateTokens(content);
        }
        categories[cat] += 20; // tool call structure overhead
      }
    }

    // Classify tool calls
    for (const tool of tools) {
      const cat = this.classifyToolCategory(tool.name, skillNames);
      const resultTokens = typeof tool.result === "string" ? estimateTokens(tool.result) : 0;
      categories[cat] += resultTokens + 20; // ~20 tokens for tool call structure
    }

    const used = Object.values(categories).reduce((a, b) => a + b, 0);
    const total = this.contextWindow;
    const free = Math.max(0, total - used);

    return { total, used, free, categories };
  }

  getEstimatedTokens(messages: unknown[]): number {
    return estimateMessagesTokens(messages);
  }
}
