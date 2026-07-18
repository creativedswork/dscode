import type { Api, Model } from "@earendil-works/pi-ai";

export const KIMI_BASE_URL = "https://api.moonshot.cn/v1";

export const KIMI_MODELS: Record<string, Omit<Model<Api>, "id" | "name">> = {
  "kimi-k3": {
    api: "openai-completions",
    provider: "kimi",
    baseUrl: KIMI_BASE_URL,
    reasoning: true,
    thinkingLevelMap: { low: null, medium: null, high: null, max: "max" },
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    compat: {
      supportsDeveloperRole: false,
      thinkingFormat: "deepseek",
      deferredToolsMode: "kimi",
    },
  },
};
