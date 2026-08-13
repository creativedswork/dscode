import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import * as nodeUtil from "node:util";

import type { OpenDesignIntegrationConfig } from "./types.js";

const DEFAULT_OPEN_DESIGN_PORT = 7456;

export interface OpenDesignConfigResolution {
  readonly config: OpenDesignIntegrationConfig;
  readonly diagnostics: readonly string[];
  readonly usedLegacyEnvironment: boolean;
  readonly valid: boolean;
}

type JsonRecord = Record<string, unknown>;
type Environment = Readonly<Record<string, string | undefined>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOpenDesignValue(settings: JsonRecord): { present: boolean; value?: unknown } {
  const integrations = settings.integrations;
  if (!isRecord(integrations) || !Object.hasOwn(integrations, "openDesign")) {
    return { present: false };
  }
  return { present: true, value: integrations.openDesign };
}

function readBoolean(
  raw: JsonRecord,
  key: "enabled" | "autoStart",
  fallback: boolean,
  diagnostics: string[],
): boolean {
  const value = raw[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  diagnostics.push(`integrations.openDesign.${key} must be a boolean; using ${fallback}`);
  return fallback;
}

function readPort(raw: unknown, diagnostics: string[], source: string): number {
  if (raw === undefined) return DEFAULT_OPEN_DESIGN_PORT;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 65535) {
    return raw;
  }
  diagnostics.push(`${source} must be an integer between 1 and 65535; using ${DEFAULT_OPEN_DESIGN_PORT}`);
  return DEFAULT_OPEN_DESIGN_PORT;
}

function readPath(raw: JsonRecord, diagnostics: string[]): string | undefined {
  const value = raw.path;
  if (value === undefined) return undefined;
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  diagnostics.push("integrations.openDesign.path must be a non-empty string");
  return undefined;
}

function frozenConfig(config: OpenDesignIntegrationConfig): OpenDesignIntegrationConfig {
  return Object.freeze({ ...config });
}

function hasInvalidConfiguration(diagnostics: readonly string[]): boolean {
  return diagnostics.some((diagnostic) =>
    diagnostic.includes(" must ")
    || diagnostic.includes(" is not allowed")
  );
}

function withLegacyEnvFileFallback(
  env: Environment,
  envFile: string | undefined,
  diagnostics: string[],
): Environment {
  if (
    !envFile
    || (typeof env.OPEN_DESIGN_DIR === "string" && env.OPEN_DESIGN_DIR.trim() !== "")
  ) {
    return env;
  }

  const parseEnv = (
    nodeUtil as unknown as {
      parseEnv?: (content: string) => Record<string, string>;
    }
  ).parseEnv;
  if (!parseEnv) {
    diagnostics.push(
      `Cannot read legacy Open Design configuration from ${envFile}: Node.js 20.12 or newer is required`,
    );
    return env;
  }

  try {
    const parsed = parseEnv(readFileSync(envFile, "utf8"));
    if (
      typeof parsed.OPEN_DESIGN_DIR !== "string"
      || parsed.OPEN_DESIGN_DIR.trim() === ""
    ) {
      return env;
    }
    return {
      ...env,
      OPEN_DESIGN_DIR: parsed.OPEN_DESIGN_DIR,
      OD_PORT: env.OD_PORT ?? parsed.OD_PORT,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push(
        `Cannot read legacy Open Design configuration from ${envFile}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return env;
  }
}

export function resolveOpenDesignConfig(
  userSettings: JsonRecord,
  projectSettings: JsonRecord,
  env: Environment = process.env,
  legacyEnvFile?: string,
): OpenDesignConfigResolution {
  const diagnostics: string[] = [];
  const user = getOpenDesignValue(userSettings);
  const project = getOpenDesignValue(projectSettings);
  const hasTypedConfig = user.present || project.present;
  const compatibilityEnv = hasTypedConfig
    ? env
    : withLegacyEnvFileFallback(env, legacyEnvFile, diagnostics);

  if (
    !hasTypedConfig
    && typeof compatibilityEnv.OPEN_DESIGN_DIR === "string"
    && compatibilityEnv.OPEN_DESIGN_DIR.trim() !== ""
  ) {
    diagnostics.push(
      "OPEN_DESIGN_DIR and OD_PORT are deprecated; configure integrations.openDesign in settings.json",
    );
    const rawPort = compatibilityEnv.OD_PORT === undefined
      ? undefined
      : Number(compatibilityEnv.OD_PORT);
    return {
      config: frozenConfig({
        enabled: false,
        path: compatibilityEnv.OPEN_DESIGN_DIR.trim(),
        port: readPort(rawPort, diagnostics, "OD_PORT"),
        autoStart: true,
      }),
      diagnostics: Object.freeze(diagnostics),
      usedLegacyEnvironment: true,
      valid: !hasInvalidConfiguration(diagnostics),
    };
  }

  if (!hasTypedConfig) {
    return {
      config: frozenConfig({
        enabled: false,
        port: DEFAULT_OPEN_DESIGN_PORT,
        autoStart: true,
      }),
      diagnostics: Object.freeze(diagnostics),
      usedLegacyEnvironment: false,
      valid: true,
    };
  }

  const userRaw = isRecord(user.value) ? user.value : {};
  const projectRaw = isRecord(project.value) ? project.value : {};
  if (user.present && !isRecord(user.value)) {
    diagnostics.push("user integrations.openDesign must be an object");
  }
  if (project.present && !isRecord(project.value)) {
    diagnostics.push("project integrations.openDesign must be an object");
  }

  const merged = { ...userRaw, ...projectRaw };
  for (const unsafeField of ["command", "executable"]) {
    if (Object.hasOwn(merged, unsafeField)) {
      diagnostics.push(`integrations.openDesign.${unsafeField} is not allowed and was ignored`);
    }
  }

  const config = frozenConfig({
    enabled: readBoolean(merged, "enabled", false, diagnostics),
    path: readPath(merged, diagnostics),
    port: readPort(merged.port, diagnostics, "integrations.openDesign.port"),
    autoStart: readBoolean(merged, "autoStart", true, diagnostics),
  });
  const frozenDiagnostics = Object.freeze(diagnostics);
  return {
    config,
    diagnostics: frozenDiagnostics,
    usedLegacyEnvironment: false,
    valid: !hasInvalidConfiguration(frozenDiagnostics),
  };
}

export function applyOpenDesignOverride(
  config: OpenDesignIntegrationConfig,
  override: { enabled?: boolean; autoStart?: boolean } | undefined,
): OpenDesignIntegrationConfig {
  if (!override) return config;
  return frozenConfig({
    ...config,
    enabled: override.enabled ?? config.enabled,
    autoStart: override.autoStart ?? config.autoStart,
  });
}

export function expandOpenDesignPath(filePath: string): string {
  const expanded = filePath === "~"
    ? homedir()
    : filePath.startsWith("~/")
      ? join(homedir(), filePath.slice(2))
      : filePath;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export { DEFAULT_OPEN_DESIGN_PORT };
