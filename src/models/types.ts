export type ThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryOnTimeout: boolean;
  retryOnRateLimit: boolean;
  retryOnServerError: boolean;
}

export interface RetryInfo {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  error: string;
  level: "stream" | "turn";
}
