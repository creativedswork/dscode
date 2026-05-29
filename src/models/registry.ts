import { getModel, getModels, getProviders } from "@mariozechner/pi-ai";
import type { Api, Model } from "@mariozechner/pi-ai";
import type { ThinkingLevel } from "../core/types.js";
import { buildQwenModel, QWEN_MODELS } from "./qwen.js";

type ModelFactory = (modelId: string) => Model<Api>;

const providerFactories = new Map<string, ModelFactory>();
const customModelDefs = new Map<string, { id: string; name: string }[]>();

export function registerProvider(
  name: string,
  factory: ModelFactory,
  models?: { id: string; name: string }[],
): void {
  providerFactories.set(name, factory);
  if (models) customModelDefs.set(name, models);
}

export function getAllProviders(): string[] {
  const builtin = getProviders() as string[];
  const custom = Array.from(providerFactories.keys());
  return [...new Set([...builtin, ...custom])];
}

export function getAllModels(provider: string): { id: string; name: string }[] {
  const builtin = getModels(provider as any) as { id: string; name: string }[];
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
  const builtin = (getModel as (p: string, m: string) => Model<Api> | undefined)(provider, modelId);
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
registerProvider(
  "qwen",
  buildQwenModel,
  Object.entries(QWEN_MODELS).map(([id, def]) => ({
    id,
    name: `Qwen: ${id}`,
  })),
);
