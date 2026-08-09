import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RuntimeConfigStore } from "../../src/config/runtime-config-store.js";
import { SettingsRepository } from "../../src/config/settings-repository.js";
import { SettingsService } from "../../src/config/settings-service.js";
import type { RuntimeConfig } from "../../src/config/types.js";

const roots: string[] = [];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "dscode-settings-service-"));
  roots.push(path);
  return path;
}

function baseConfig(projectPath: string): RuntimeConfig {
  return {
    provider: "deepseek",
    modelId: "deepseek-v4-flash",
    thinkingLevel: "high",
    maxTokens: 8192,
    startupPath: projectPath,
    projectPath,
    configDir: join(projectPath, "config"),
    dataDir: join(projectPath, "data"),
    userSkillsDir: join(projectPath, "config", "skills"),
    projectSkillsDir: join(projectPath, ".dscode", "skills"),
    userCommandsDir: join(projectPath, "config", "commands"),
    projectCommandsDir: join(projectPath, ".dscode", "commands"),
    context: {
      strategy: "sliding-window",
      targetUtilization: 0.85,
      minRetainedMessages: 6,
    },
    memory: {
      enabled: true,
      autoExtract: false,
      maxGlobalEntries: 50,
      maxProjectEntries: 100,
    },
    permissions: {
      defaultDecision: "ask",
      rules: [],
      denyPatterns: [],
    },
    skills: [],
    disabledSkills: [],
    mcp: [],
    appHost: { enabled: false },
    agents: { enabled: true },
    retry: {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      retryOnTimeout: true,
      retryOnRateLimit: true,
      retryOnServerError: true,
    },
  };
}

function fixture() {
  const projectPath = root();
  const repository = new SettingsRepository();
  const initial = baseConfig(projectPath);
  const runtimeStore = new RuntimeConfigStore(initial);
  const userConfig = join(projectPath, "config", "config.json");
  const projectSettings = join(projectPath, ".dscode", "settings.json");
  const applied = vi.fn();
  const resolveRuntimeConfig = () => {
    const command = repository.readOrEmpty(userConfig);
    const project = repository.readOrEmpty(projectSettings);
    return {
      ...initial,
      apiKey: command.apiKey as string | undefined,
      disabledSkills: Array.isArray(project.disabledSkills)
        ? project.disabledSkills as string[]
        : [],
    };
  };
  const service = new SettingsService({
    repository,
    runtimeStore,
    paths: {
      userConfig,
      userSettings: join(projectPath, "config", "settings.json"),
      projectSettings: () => projectSettings,
    },
    resolveRuntimeConfig,
    onApplied: applied,
  });
  return {
    service,
    runtimeStore,
    userConfig,
    projectSettings,
    applied,
  };
}

afterEach(() => {
  for (const path of roots.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("SettingsService", () => {
  it("persists, applies, masks, and notifies exactly once", async () => {
    const { service, runtimeStore, userConfig, applied } = fixture();
    const notified = vi.fn();
    runtimeStore.onChange(notified);

    const previous = runtimeStore.get();
    await service.setApiKey("secret-key-123456");

    expect(JSON.parse(readFileSync(userConfig, "utf8"))).toEqual({
      apiKey: "secret-key-123456",
    });
    expect(runtimeStore.get().apiKey).toBe("secret-key-123456");
    expect(service.getPublicSnapshot().apiKey).toBe("sec****3456");
    expect(previous.apiKey).toBeUndefined();
    expect(applied).toHaveBeenCalledOnce();
    expect(notified).toHaveBeenCalledOnce();
  });

  it("uses one project patch path for Skill and Permission commands", async () => {
    const { service, projectSettings } = fixture();

    await service.setSkillEnabled("review", false);
    await service.persistRule({
      tool: "bash",
      decision: "allow",
    });

    expect(JSON.parse(readFileSync(projectSettings, "utf8"))).toEqual({
      disabledSkills: ["review"],
      permissions: { allow: ["bash"] },
    });
  });

  it("keeps equivalent adapter calls on the same command contract", async () => {
    const first = fixture();
    const second = fixture();
    const tuiCommand = (service: SettingsService) =>
      service.setApiKey("adapter-key-123456");
    const webCommand = (service: SettingsService) =>
      service.setApiKey("adapter-key-123456");

    await tuiCommand(first.service);
    await webCommand(second.service);

    const { projectPath: _firstPath, ...firstSnapshot } =
      first.service.getPublicSnapshot();
    const { projectPath: _secondPath, ...secondSnapshot } =
      second.service.getPublicSnapshot();
    expect(firstSnapshot).toEqual(secondSnapshot);
    expect(JSON.parse(readFileSync(first.userConfig, "utf8"))).toEqual(
      JSON.parse(readFileSync(second.userConfig, "utf8")),
    );
    expect(first.applied).toHaveBeenCalledOnce();
    expect(second.applied).toHaveBeenCalledOnce();
  });
});
