import type { HarnessEvent } from "../core/events.js";
import type { ImageContent } from "@earendil-works/pi-ai";

export interface ConversationPromptOptions {
  text: string;
  images?: readonly ImageContent[];
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  messageCount(): number;
  truncateMessages(length: number): void;
  prompt(text: string, images?: readonly ImageContent[]): Promise<void>;
  lastError(): string | undefined;
  isRetryable(error: string): boolean;
  save(): void;
  publish(event: HarnessEvent): void;
  sleep?(delayMs: number): Promise<void>;
  random?(): number;
}

export class ConversationCoordinator {
  private activeTurn: Promise<void> | null = null;
  private sessionSwitchInProgress = false;

  get isSessionSwitching(): boolean {
    return this.sessionSwitchInProgress;
  }

  get currentTurn(): Promise<void> | null {
    return this.activeTurn;
  }

  run(operation: () => Promise<void>): Promise<void> {
    if (this.sessionSwitchInProgress) {
      return Promise.reject(
        new Error("Cannot submit a prompt while a session switch is in progress"),
      );
    }
    if (this.activeTurn) {
      return Promise.reject(new Error("A Main Agent turn is already in progress"));
    }
    const operationPromise = operation();
    let tracked: Promise<void>;
    tracked = operationPromise.finally(() => {
      if (this.activeTurn === tracked) this.activeTurn = null;
    });
    this.activeTurn = tracked;
    return tracked;
  }

  prompt(options: ConversationPromptOptions): Promise<void> {
    return this.run(() => this.executePrompt(options));
  }

  beginSessionSwitch(): void {
    if (this.sessionSwitchInProgress) {
      throw new Error("A session switch is already in progress");
    }
    this.sessionSwitchInProgress = true;
  }

  endSessionSwitch(): void {
    this.sessionSwitchInProgress = false;
  }

  async quiesce(abort: () => void): Promise<void> {
    const activeTurn = this.activeTurn;
    if (!activeTurn) return;
    abort();
    try {
      await activeTurn;
    } catch {
      // Aborted turns may reject. Session switching only requires quiescence.
    }
  }

  abort(abortRuntime: () => void): void {
    abortRuntime();
  }

  async executePrompt(options: ConversationPromptOptions): Promise<void> {
    const preTurnLength = options.messageCount();
    const sleep = options.sleep ?? ((delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)));

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      if (attempt > 0) {
        options.truncateMessages(preTurnLength);
        const delayMs = this.retryDelay(
          attempt,
          options.baseDelayMs,
          options.maxDelayMs,
          options.random,
        );
        options.publish({
          type: "llm:retry",
          attempt,
          maxRetries: options.maxRetries,
          delayMs,
          error: "",
          level: "turn",
        });
        await sleep(delayMs);
      }

      options.publish({ type: "turn:start" });
      await options.prompt(options.text, options.images);
      const error = options.lastError();
      if (!error) {
        options.save();
        return;
      }

      const terminal = !options.isRetryable(error)
        || attempt >= options.maxRetries;
      if (terminal) {
        options.publish({
          type: "llm:retry",
          attempt: attempt + 1,
          maxRetries: options.maxRetries,
          delayMs: 0,
          error,
          level: "turn",
        });
        options.publish({ type: "ui:error", text: `Model error: ${error}` });
        options.publish({
          type: "turn:error",
          error,
          attempt: attempt + 1,
          maxRetries: options.maxRetries,
        });
        if (attempt >= options.maxRetries && options.isRetryable(error)) {
          options.publish({ type: "ui:error", text: "✗ All retries exhausted" });
        }
        options.save();
        return;
      }

      options.publish({
        type: "llm:retry",
        attempt: attempt + 1,
        maxRetries: options.maxRetries,
        delayMs: this.retryDelay(
          attempt + 1,
          options.baseDelayMs,
          options.maxDelayMs,
          options.random,
        ),
        error,
        level: "turn",
      });
    }
  }

  private retryDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    random: (() => number) | undefined,
  ): number {
    const jitter = (random ?? Math.random)() * 500;
    return Math.min(
      baseDelayMs * Math.pow(2, attempt - 1) + jitter,
      maxDelayMs,
    );
  }
}
