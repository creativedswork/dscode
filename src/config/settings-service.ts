import type { VisionConfig } from "../drivers/vision/types.js";
import {
  getAllModels,
  getThinkingLevel,
  getVisionModels,
  resolveModel,
} from "../models/index.js";
import type { ThinkingLevel } from "../models/types.js";
import type {
  PermissionPolicyStore,
  PermissionRuleConfig,
} from "../permissions/types.js";
import type {
  PublicRuntimeConfigSnapshot,
  RuntimeConfig,
  RuntimeConfigSnapshot,
} from "./types.js";
import { projectPublicRuntimeConfig } from "./public-snapshot.js";
import type { JsonRecord } from "./settings-repository.js";
import {
  mergeSettingsPatch,
  SettingsRepository,
} from "./settings-repository.js";
import { RuntimeConfigStore } from "./runtime-config-store.js";

export type SettingsChangeReason =
  | "model"
  | "provider"
  | "thinking"
  | "api-key"
  | "vision"
  | "skill"
  | "permission"
  | "project"
  | "runtime";

export interface SettingsServicePaths {
  readonly userConfig: string;
  readonly userSettings: string;
  readonly projectSettings: (projectPath: string) => string;
}

export interface SettingsServiceOptions {
  readonly repository: SettingsRepository;
  readonly runtimeStore: RuntimeConfigStore;
  readonly paths: SettingsServicePaths;
  readonly resolveRuntimeConfig: (projectPath: string) => RuntimeConfig;
  readonly onApplied?: (
    previous: RuntimeConfigSnapshot,
    next: RuntimeConfigSnapshot,
    reason: SettingsChangeReason,
  ) => void | Promise<void>;
}

const THINKING_LEVELS = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export class SettingsService implements PermissionPolicyStore {
  constructor(private readonly options: SettingsServiceOptions) {}

  getSnapshot(): RuntimeConfigSnapshot {
    return this.options.runtimeStore.get();
  }

  getPublicSnapshot(): PublicRuntimeConfigSnapshot {
    return projectPublicRuntimeConfig(this.getSnapshot());
  }

  async setModel(modelId: string): Promise<RuntimeConfigSnapshot> {
    const current = this.getSnapshot();
    resolveModel(current.provider, modelId);
    const thinkingLevel = getThinkingLevel(current.provider, modelId);
    return this.patchUserConfig(
      { modelId, thinkingLevel },
      "model",
      { modelId, thinkingLevel },
    );
  }

  async setProvider(provider: string): Promise<RuntimeConfigSnapshot> {
    const models = getAllModels(provider);
    if (models.length === 0) throw new Error(`Unknown provider: ${provider}`);
    const modelId = models[0].id;
    resolveModel(provider, modelId);
    const thinkingLevel = getThinkingLevel(provider, modelId);
    return this.patchUserConfig(
      { provider, modelId, thinkingLevel },
      "provider",
      { provider, modelId, thinkingLevel },
    );
  }

  async setThinking(level: string): Promise<RuntimeConfigSnapshot> {
    if (!THINKING_LEVELS.has(level as ThinkingLevel)) {
      throw new Error(`Invalid thinking level: ${level}`);
    }
    return this.patchUserConfig(
      { thinkingLevel: level },
      "thinking",
      { thinkingLevel: level as ThinkingLevel },
    );
  }

  async setApiKey(apiKey: string): Promise<RuntimeConfigSnapshot> {
    if (apiKey.trim() === "") throw new Error("API key must not be empty");
    return this.patchUserConfig({ apiKey }, "api-key", { apiKey });
  }

  async setVisionProvider(provider: string): Promise<RuntimeConfigSnapshot> {
    const models = getVisionModels(provider);
    if (models.length === 0) {
      throw new Error(`Provider has no vision-capable models: ${provider}`);
    }
    const current = this.getSnapshot().vision;
    const vision: VisionConfig = {
      provider,
      model: models.some((item) => item.id === current?.model)
        ? current!.model
        : models[0].id,
      key: current?.key,
    };
    return this.patchUserConfig({ vision }, "vision", { vision });
  }

  async setVisionModel(model: string): Promise<RuntimeConfigSnapshot> {
    const current = this.getSnapshot().vision;
    if (!current?.provider) throw new Error("Configure a vision provider first");
    if (!getVisionModels(current.provider).some((item) => item.id === model)) {
      throw new Error(`Unknown vision model: ${model} for provider ${current.provider}`);
    }
    const vision = { ...current, model } as VisionConfig;
    return this.patchUserConfig({ vision }, "vision", { vision });
  }

  async setVisionKey(key: string): Promise<RuntimeConfigSnapshot> {
    const current = this.getSnapshot().vision;
    if (!current) throw new Error("Configure a vision provider and model first");
    const vision = { ...current, key } as VisionConfig;
    return this.patchUserConfig({ vision }, "vision", { vision });
  }

  async clearVision(): Promise<RuntimeConfigSnapshot> {
    return this.patchUserConfig({ vision: null }, "vision", { vision: undefined });
  }

  async setSkillEnabled(
    name: string,
    enabled: boolean,
  ): Promise<RuntimeConfigSnapshot> {
    const path = this.options.paths.projectSettings(this.getSnapshot().projectPath);
    await this.options.repository.patch(path, (settings) => {
      const disabled = Array.isArray(settings.disabledSkills)
        ? settings.disabledSkills.filter((item): item is string => typeof item === "string")
        : [];
      const next = enabled
        ? disabled.filter((item) => item !== name)
        : [...new Set([...disabled, name])];
      return mergeSettingsPatch(settings, { disabledSkills: next });
    });
    return this.refresh("skill");
  }

  async persistRule(rule: PermissionRuleConfig): Promise<void> {
    const path = this.options.paths.projectSettings(this.getSnapshot().projectPath);
    await this.options.repository.patch(path, (settings) => {
      const permissions = settings.permissions
        && typeof settings.permissions === "object"
        && !Array.isArray(settings.permissions)
        ? settings.permissions as JsonRecord
        : {};
      const key = rule.decision === "allow" ? "allow" : "deny";
      const existing = Array.isArray(permissions[key])
        ? permissions[key].filter((item): item is string => typeof item === "string")
        : [];
      const pattern = rule.tool;
      return mergeSettingsPatch(settings, {
        permissions: {
          ...permissions,
          [key]: [...new Set([...existing, pattern])],
        },
      });
    });
    await this.refresh("permission");
  }

  async replaceProjectRuntime(
    config: RuntimeConfig,
  ): Promise<RuntimeConfigSnapshot> {
    return this.applyResolved(config, "project");
  }

  async replaceRuntime(config: RuntimeConfig): Promise<RuntimeConfigSnapshot> {
    return this.applyResolved(config, "runtime");
  }

  private async patchUserConfig(
    partial: JsonRecord,
    reason: SettingsChangeReason,
    runtimeOverride: Partial<RuntimeConfig>,
  ): Promise<RuntimeConfigSnapshot> {
    await this.options.repository.patchObject(this.options.paths.userConfig, partial);
    return this.refresh(reason, runtimeOverride);
  }

  private refresh(
    reason: SettingsChangeReason,
    runtimeOverride: Partial<RuntimeConfig> = {},
  ): Promise<RuntimeConfigSnapshot> {
    const current = this.getSnapshot();
    const resolved = this.options.resolveRuntimeConfig(current.projectPath);
    return this.applyResolved({ ...resolved, ...runtimeOverride }, reason);
  }

  private async applyResolved(
    config: RuntimeConfig,
    reason: SettingsChangeReason,
  ): Promise<RuntimeConfigSnapshot> {
    const previous = this.getSnapshot();
    const next = this.options.runtimeStore.replace(config, false);
    try {
      await this.options.onApplied?.(previous, next, reason);
      this.options.runtimeStore.notify();
      return next;
    } catch (error) {
      this.options.runtimeStore.replace(
        previous as unknown as RuntimeConfig,
        false,
      );
      throw error;
    }
  }
}
