import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, loadUserSettings, saveUserConfig, saveUserSettings } from "../../src/core/config.js";

describe("config and settings loading", () => {
  const originalCwd = process.cwd();
  const originalProjectPath = process.env.DSCODE_PROJECT_PATH;
  const originalConfigHome = process.env.DSCODE_CONFIG_HOME;
  const originalDataHome = process.env.DSCODE_DATA_HOME;
  const originalOpenDesignDir = process.env.OPEN_DESIGN_DIR;
  const originalOdPort = process.env.OD_PORT;
  const originalHome = process.env.HOME;
  let isolatedHome: string;

  beforeEach(() => {
    isolatedHome = mkdtempSync(join(tmpdir(), "dscode-home-"));
    process.env.HOME = isolatedHome;
    delete process.env.OPEN_DESIGN_DIR;
    delete process.env.OD_PORT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    rmSync(isolatedHome, { recursive: true, force: true });
    if (originalProjectPath === undefined) delete process.env.DSCODE_PROJECT_PATH;
    else process.env.DSCODE_PROJECT_PATH = originalProjectPath;
    if (originalConfigHome === undefined) delete process.env.DSCODE_CONFIG_HOME;
    else process.env.DSCODE_CONFIG_HOME = originalConfigHome;
    if (originalDataHome === undefined) delete process.env.DSCODE_DATA_HOME;
    else process.env.DSCODE_DATA_HOME = originalDataHome;
    if (originalOpenDesignDir === undefined) delete process.env.OPEN_DESIGN_DIR;
    else process.env.OPEN_DESIGN_DIR = originalOpenDesignDir;
    if (originalOdPort === undefined) delete process.env.OD_PORT;
    else process.env.OD_PORT = originalOdPort;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  });

  it("defaults to startup path and does not persist cwd to user config", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(realpathSync(config.projectPath)).toBe(realpathSync(workspace));
    expect(realpathSync(process.cwd())).toBe(realpathSync(originalCwd));

    // config.json may or may not exist after loadConfig (saveUserProjectCwd removed)
    // If it does exist from a previous run, cwd/cwdProjectPath should not be present
    rmSync(root, { recursive: true, force: true });
  });


  it("ignores persisted cwd in user config and uses startup path", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");
    const target = join(workspace, "nested-project");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(configHome, "config.json"),
      JSON.stringify({ cwd: target, cwdProjectPath: workspace, modelId: "deepseek-v4-pro" }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    // Old cwd/cwdProjectPath in config.json should be ignored
    // projectPath should remain at startupPath (workspace), not the old persisted cwd (target)
    expect(realpathSync(config.projectPath)).toBe(realpathSync(workspace));
    expect(realpathSync(process.cwd())).toBe(realpathSync(originalCwd));
    expect(config.modelId).toBe("deepseek-v4-pro");

    rmSync(root, { recursive: true, force: true });
  });

  it("keeps startup path when persisted cwd belongs to another startup project", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");
    const otherWorkspace = join(root, "other-workspace");
    const target = join(workspace, "nested-project");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    mkdirSync(otherWorkspace, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(
      join(configHome, "config.json"),
      JSON.stringify({ cwd: target, cwdProjectPath: workspace }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = otherWorkspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(realpathSync(config.projectPath)).toBe(realpathSync(otherWorkspace));
    expect(realpathSync(process.cwd())).toBe(realpathSync(originalCwd));

    rmSync(root, { recursive: true, force: true });
  });

  it("keeps startup path when persisted cwd does not exist", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(configHome, "config.json"),
      JSON.stringify({ cwd: join(workspace, "missing"), cwdProjectPath: workspace }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(realpathSync(config.projectPath)).toBe(realpathSync(workspace));
    expect(realpathSync(process.cwd())).toBe(realpathSync(originalCwd));

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
      expect.objectContaining({
        name: "demo",
        command: "npx",
        args: ["demo-mcp"],
        transport: "stdio",
        preferredProtocolVersion: "2025-11-25",
        allowLegacySseFallback: true,
      }),
    ]);

    rmSync(root, { recursive: true, force: true });
  });


  it("writes command config only to user config.json", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");

    mkdirSync(configHome, { recursive: true });
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    saveUserConfig({ modelId: "deepseek-v4-pro" });

    const saved = JSON.parse(readFileSync(join(configHome, "config.json"), "utf8"));
    expect(saved).toMatchObject({ modelId: "deepseek-v4-pro" });
    expect(saved.cwd).toBeUndefined();

    rmSync(root, { recursive: true, force: true });
  });

  it("writes permission rules to user settings.json without dropping existing settings", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");

    mkdirSync(configHome, { recursive: true });
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    saveUserSettings({
      skills: ["git-workflow"],
      permissions: { deny: ["**/.env"] },
    });
    saveUserSettings({
      permissions: {
        ...((loadUserSettings().permissions as Record<string, unknown> | undefined) ?? {}),
        rules: [
          { tool: "bash", argPattern: "^\\{\\\"command\\\":\\\"npm test\\\"\\}$", decision: "allow", reason: "saved from permission prompt", priority: 20 },
        ],
      },
    });

    const saved = JSON.parse(readFileSync(join(configHome, "settings.json"), "utf8"));
    expect(saved.skills).toEqual(["git-workflow"]);
    expect(saved.permissions.deny).toEqual(["**/.env"]);
    expect(saved.permissions.rules).toHaveLength(1);
    expect(saved.permissions.rules[0]).toMatchObject({ tool: "bash", decision: "allow" });

    rmSync(root, { recursive: true, force: true });
  });

  it("defaults URL-based MCP servers to streamable-http", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");

    mkdirSync(join(workspace, ".dscode"), { recursive: true });
    writeFileSync(
      join(workspace, ".dscode", "settings.json"),
      JSON.stringify({
        mcpServers: {
          remote: { url: "https://example.com/mcp" },
        },
      }) + "\n",
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect(config.mcp).toEqual([
      expect.objectContaining({
        name: "remote",
        url: "https://example.com/mcp",
        transport: "streamable-http",
        preferredProtocolVersion: "2025-11-25",
        allowLegacySseFallback: true,
      }),
    ]);

    rmSync(root, { recursive: true, force: true });
  });

  it("leaves Integration namespaces out of the Core runtime config", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-config-"));
    const configHome = join(root, "home");
    const workspace = join(root, "workspace");

    mkdirSync(configHome, { recursive: true });
    mkdirSync(join(workspace, ".dscode"), { recursive: true });
    writeFileSync(
      join(workspace, ".dscode", "settings.json"),
      JSON.stringify({
        integrations: {
          openDesign: {
            enabled: true,
            path: "/open-design",
          },
        },
      }),
      "utf8",
    );

    process.env.DSCODE_PROJECT_PATH = workspace;
    process.env.DSCODE_CONFIG_HOME = configHome;
    process.env.DSCODE_DATA_HOME = configHome;

    const config = loadConfig();

    expect("integrations" in config).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});
