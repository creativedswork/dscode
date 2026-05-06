import type { ContextConfig } from "../core/types.js";
import { estimateMessagesTokens, estimateTokens } from "./estimator.js";
import { dropOldest, slidingWindow } from "./compaction.js";

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

  getEstimatedTokens(messages: unknown[]): number {
    return estimateMessagesTokens(messages);
  }
}
