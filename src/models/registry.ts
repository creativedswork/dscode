import { getModel } from "@mariozechner/pi-ai";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "../core/types.js";
import { buildQwenModel } from "./qwen.js";

type ModelFactory = (modelId: string) => Model<Api>;

const providers = new Map<string, ModelFactory>();

export function registerProvider(name: string, factory: ModelFactory): void {
  providers.set(name, factory);
}

export function resolveModel(provider: string, modelId: string): Model<Api> {
  const builtin = (getModel as (p: string, m: string) => Model<Api> | undefined)(provider, modelId);
  if (builtin) return builtin;

  const factory = providers.get(provider);
  if (factory) {
    const model = factory(modelId);
    if (model) return model;
  }

  throw new Error(`Unknown model: ${modelId} for provider ${provider}`);
}

export function getThinkingLevel(provider: string, modelId: string): ThinkingLevel {
  try {
    const model = resolveModel(provider, modelId);
    if (model.reasoning) return "high";
    return "off";
  } catch {
    // model not found — fall through to heuristic
  }

  if (modelId.includes("thinking")) return "high";
  if (modelId.includes("pro")) return "medium";
  return "off";
}

// Register built-in providers
registerProvider("qwen", buildQwenModel);
