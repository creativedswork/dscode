import type { Api, Model } from "@earendil-works/pi-ai";

export const DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";

export const QWEN_MODELS: Record<string, Omit<Model<Api>, "id" | "name">> = {
  "qwen3.6-plus": {
    api: "openai-completions",
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 65536,
    compat: { supportsDeveloperRole: false },
  },
  "qwen3-coder": {
    api: "openai-completions",
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false },
  },
  "qwq-32b": {
    api: "openai-completions",
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false },
  },
  "qwen-max": {
    api: "openai-completions",
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_768,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false },
  },
  "qwen-plus": {
    api: "openai-completions",
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false },
  },
  "qwen-turbo": {
    api: "openai-completions",
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_000_000,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false },
  },
};

export function buildQwenModel(modelId: string): Model<Api> {
  const key = modelId.startsWith("qwen/") ? modelId.slice(5) : modelId;
  const def = QWEN_MODELS[key];
  if (def) return { id: modelId, name: `Qwen: ${modelId}`, ...def };
  return {
    id: modelId,
    name: `Qwen: ${modelId}`,
    api: "openai-completions" as const,
    provider: "qwen",
    baseUrl: DASHSCOPE_BASE,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131_072,
    maxTokens: 8192,
  };
}
