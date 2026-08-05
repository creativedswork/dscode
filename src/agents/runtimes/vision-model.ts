import type { AgentApplicationSnapshot } from "../application/types.js";
import type { VisionConfig } from "../../core/types.js";

export interface VisionModelResolutionConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  vision?: VisionConfig;
  agentModelAliases?: Partial<Record<"haiku" | "sonnet" | "opus", string>>;
}

export function resolveVisionApplicationConfig(
  application: AgentApplicationSnapshot,
  config: VisionModelResolutionConfig,
): VisionConfig | undefined {
  let selector = application.model;
  if (!selector || selector === "vision") return config.vision;
  if (["haiku", "sonnet", "opus"].includes(selector)) {
    selector = config.agentModelAliases?.[
      selector as "haiku" | "sonnet" | "opus"
    ];
    if (!selector) return undefined;
  }

  if (selector === "inherit") {
    return {
      provider: config.provider,
      model: config.modelId,
      key: config.apiKey,
    };
  }

  const separator = selector.indexOf("/");
  const provider = separator > 0
    ? selector.slice(0, separator)
    : config.vision?.provider ?? config.provider;
  const model = separator > 0 ? selector.slice(separator + 1) : selector;
  const key = provider === config.vision?.provider
    ? config.vision.key
    : provider === config.provider
      ? config.apiKey
      : undefined;
  return { provider, model, key };
}
