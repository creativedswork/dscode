import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, saveUserConfig } from "../../src/core/config.js";

describe("config and settings loading", () => {
  const originalCwd = process.cwd();
  const originalProjectPath = process.env.DSCODE_PROJECT_PATH;
  const originalConfigHome = process.env.DSCODE_CONFIG_HOME;
  const originalDataHome = process.env.DSCODE_DATA_HOME;

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalProjectPath === undefined) delete process.env.DSCODE_PROJECT_PATH;
    else process.env.DSCODE_PROJECT_PATH = originalProjectPath;
    if (originalConfigHome === undefined) delete process.env.DSCODE_CONFIG_HOME;
    else process.env.DSCODE_CONFIG_HOME = originalConfigHome;
    if (originalDataHome === undefined) delete process.env.DSCODE_DATA_HOME;
    else process.env.DSCODE_DATA_HOME = originalDataHome;
  });

  it("switches projectPath using user config cwd on restart", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");
    const target = join(workspace, "nested-project");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(configHome, "config.json"),
      JSON.stringify({ cwd: target, modelId: "deepseek-v4-pro" }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(realpathSync(config.projectPath)).toBe(realpathSync(target));
    expect(realpathSync(process.cwd())).toBe(realpathSync(target));
    expect(config.modelId).toBe("deepseek-v4-pro");

    rmSync(root, { recursive: true, force: true });
  });

  it("keeps startup path when user config cwd does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(configHome, "config.json"),
      JSON.stringify({ cwd: join(workspace, "missing") }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(realpathSync(config.projectPath)).toBe(realpathSync(workspace));
    expect(realpathSync(process.cwd())).toBe(realpathSync(workspace));

    rmSync(root, { recursive: true, force: true });
  });

  it("loads project settings from settings.json", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");

    mkdirSync(join(workspace, ".dscode"), { recursive: true });
    writeFileSync(
      join(workspace, ".dscode", "settings.json"),
      JSON.stringify({
        skills: ["git-workflow"],
        permissions: { deny: ["**/.env"] },
        mcpServers: {
          demo: { command: "npx", args: ["demo-mcp"] },
        },
      }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(config.skills).toContain("git-workflow");
    expect(config.permissions.denyPatterns).toContain("**/.env");
    expect(config.mcp).toEqual([
      expect.objectContaining({ name: "demo", command: "npx", args: ["demo-mcp"], transport: "stdio" }),
    ]);

    rmSync(root, { recursive: true, force: true });
  });


  it("writes command config only to user config.json", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");

    mkdirSync(configHome, { recursive: true });
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    saveUserConfig({ modelId: "deepseek-v4-pro", cwd: "/tmp/project" });

    const saved = JSON.parse(readFileSync(join(configHome, "config.json"), "utf8"));
    expect(saved).toMatchObject({ modelId: "deepseek-v4-pro", cwd: "/tmp/project" });

    rmSync(root, { recursive: true, force: true });
  });
});
