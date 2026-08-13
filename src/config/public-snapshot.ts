import type {
  PublicRuntimeConfigSnapshot,
  RuntimeConfigSnapshot,
} from "./types.js";

export function maskSecret(value: string | undefined): string {
  if (!value || value.length < 12) return "(not set)";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

export function projectPublicRuntimeConfig(
  config: RuntimeConfigSnapshot,
): PublicRuntimeConfigSnapshot {
  return Object.freeze({
    provider: config.provider,
    modelId: config.modelId,
    apiKey: maskSecret(config.apiKey),
    thinkingLevel: config.thinkingLevel,
    maxTokens: config.maxTokens,
    projectPath: config.projectPath,
    skills: Object.freeze([...config.skills]),
    disabledSkills: Object.freeze([...config.disabledSkills]),
    atFile: config.atFile
      ? Object.freeze({ ...config.atFile })
      : undefined,
    vision: config.vision
      ? Object.freeze({
        provider: config.vision.provider,
        model: config.vision.model,
        key: maskSecret(config.vision.key),
      })
      : undefined,
  });
}
