import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { Api, AssistantMessage, AssistantMessageEventStream, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { createProvider, lazyApi, envApiKeyAuth } from "@earendil-works/pi-ai";
import { DASHSCOPE_BASE, QWEN_MODELS } from "./qwen.js";
import { KIMI_BASE_URL, KIMI_MODELS } from "./kimi.js";
import type { ThinkingLevel } from "../core/types.js";

type ModelFactory = (modelId: string) => Model<Api>;

const providerFactories = new Map<string, ModelFactory>();
const customModelDefs = new Map<string, { id: string; name: string }[]>();

const models = builtinModels();

// Register qwen as a pi-ai custom provider (DashScope OpenAI-compatible)
const qwenProvider = createProvider({
  id: "qwen",
  name: "Qwen (DashScope)",
  baseUrl: DASHSCOPE_BASE,
  auth: { apiKey: envApiKeyAuth("DashScope API key", ["DASHSCOPE_API_KEY"]) },
  models: Object.entries(QWEN_MODELS).map(([id, def]) => ({ id, name: `Qwen: ${id}`, ...def })) as Model<"openai-completions">[],
  api: lazyApi(() => import("@earendil-works/pi-ai/api/openai-completions")),
});

// Register kimi as a pi-ai custom provider (platform.kimi.com → Moonshot API)
const kimiProvider = createProvider({
  id: "kimi",
  name: "Kimi (Moonshot)",
  baseUrl: KIMI_BASE_URL,
  auth: { apiKey: envApiKeyAuth("Kimi API key", ["KIMI_API_KEY", "MOONSHOT_API_KEY"]) },
  models: Object.entries(KIMI_MODELS).map(([id, def]) => ({ id, name: `Kimi ${id}`, ...def })) as Model<"openai-completions">[],
  api: lazyApi(() => import("@earendil-works/pi-ai/api/openai-completions")),
});
models.setProvider(kimiProvider);
models.setProvider(qwenProvider);

export function registerProvider(
  name: string,
  factory: ModelFactory,
  models?: { id: string; name: string }[],
): void {
  providerFactories.set(name, factory);
  if (models) customModelDefs.set(name, models);
}

export function getAllProviders(): string[] {
  const builtin = models.getProviders().map((p) => p.id);
  const custom = Array.from(providerFactories.keys());
  return [...new Set([...builtin, ...custom])];
}

export function getAllModels(provider: string): { id: string; name: string }[] {
  const builtin = models.getModels(provider as any).map((m) => ({ id: m.id, name: m.name }));
  if (builtin.length > 0) return builtin;
  return customModelDefs.get(provider) ?? [];
}

export function getVisionModels(provider: string): { id: string; name: string }[] {
  const all = getAllModels(provider);
  return all.filter((m) => {
    try {
      const model = resolveModel(provider, m.id);
      return model.input.includes("image");
    } catch {
      return false;
    }
  });
}

export function getVisionProviders(): string[] {
  return getAllProviders().filter((p) => getVisionModels(p).length > 0);
}

export function resolveModel(provider: string, modelId: string): Model<Api> {
  const builtin = models.getModel(provider, modelId);
  if (builtin) return builtin;

  const factory = providerFactories.get(provider);
  if (factory) {
    const model = factory(modelId);
    if (model) return model;
  }

  throw new Error(`Unknown model: ${modelId} for provider ${provider}`);
}

export function getThinkingLevel(provider: string, modelId: string): ThinkingLevel {
  try {
    const model = resolveModel(provider, modelId);
    if (!model.reasoning) return "off";
    // Check thinkingLevelMap for constrained level support
    if (model.thinkingLevelMap) {
      const supportedLevels = Object.entries(model.thinkingLevelMap)
        .filter(([, v]) => v !== null) as [string, string][];
      if (supportedLevels.length === 0) return "off";
      if (supportedLevels.length === 1 && supportedLevels[0][0] === "max") return "max";
    }
    return "high";
  } catch {
    // model not found — fall through to heuristic
  }

  if (modelId.includes("thinking")) return "high";
  if (modelId.includes("pro")) return "medium";
  return "off";
}



export function streamSimple(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  return models.streamSimple(model, context, options);
}

export function completeSimple(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
  return models.completeSimple(model, context, options);
}

export function complete(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
  return models.complete(model, context, options);
}

// --- Environment API key lookup ---

const API_KEY_ENV_VARS: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  zai: "ZAI_API_KEY",
  "kimi": "KIMI_API_KEY",
  "zai-coding-cn": "ZAI_CODING_CN_API_KEY",
  mistral: "MISTRAL_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  moonshotai: "MOONSHOT_API_KEY",
  "moonshotai-cn": "MOONSHOT_API_KEY",
  huggingface: "HF_TOKEN",
  fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_API_KEY",
  opencode: "OPENCODE_API_KEY",
  "opencode-go": "OPENCODE_API_KEY",
  "kimi-coding": "KIMI_API_KEY",
  "cloudflare-workers-ai": "CLOUDFLARE_API_KEY",
  "cloudflare-ai-gateway": "CLOUDFLARE_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  "ant-ling": "ANT_LING_API_KEY",
  xiaomi: "XIAOMI_API_KEY",
  "xiaomi-token-plan-cn": "XIAOMI_TOKEN_PLAN_CN_API_KEY",
  "xiaomi-token-plan-ams": "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
  "xiaomi-token-plan-sgp": "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
};

export function getEnvApiKey(provider: string): string | undefined {
  const envVar = API_KEY_ENV_VARS[provider];
  if (envVar && process.env[envVar]) {
    return process.env[envVar];
  }
  return undefined;
}

// qwen provider is now registered via createProvider() + models.setProvider() above
