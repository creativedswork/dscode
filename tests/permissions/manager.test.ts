import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  PermissionManager,
  PermissionPromptQueue,
} from "../../src/permissions/manager.js";
import type { PermissionsConfig } from "../../src/permissions/types.js";

function createPromptFn() {
  return async (_toolName: string, _preview: string) => ({
    decision: "allow" as const,
    rememberForSession: false,
  });
}

describe("PermissionManager", () => {
  let defaultConfig: PermissionsConfig;
  const originalConfigHome = process.env.DSCODE_CONFIG_HOME;
  const originalDataHome = process.env.DSCODE_DATA_HOME;

  beforeEach(() => {
    defaultConfig = {
      defaultDecision: "ask",
      rules: [],
      denyPatterns: [],
    };
  });

  afterEach(() => {
    if (originalConfigHome === undefined) delete process.env.DSCODE_CONFIG_HOME;
    else process.env.DSCODE_CONFIG_HOME = originalConfigHome;
    if (originalDataHome === undefined) delete process.env.DSCODE_DATA_HOME;
    else process.env.DSCODE_DATA_HOME = originalDataHome;
  });

  it("serializes concurrent permission prompts", async () => {
    const queue = new PermissionPromptQueue();
    const started: string[] = [];
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;

    const first = queue.enqueue(() => new Promise<string>((resolve) => {
      started.push("first");
      resolveFirst = resolve;
    }));
    const second = queue.enqueue(() => new Promise<string>((resolve) => {
      started.push("second");
      resolveSecond = resolve;
    }));

    await Promise.resolve();
    expect(started).toEqual(["first"]);

    resolveFirst("allowed-first");
    await expect(first).resolves.toBe("allowed-first");
    await Promise.resolve();
    expect(started).toEqual(["first", "second"]);

    resolveSecond("allowed-second");
    await expect(second).resolves.toBe("allowed-second");
  });

  it("should allow read_file by default", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "read_file" },
      args: { path: "/some/file.txt" },
    });
    expect(result).toBeUndefined();
  });

  it("should allow list_files by default", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "list_files" },
      args: { path: "/some/dir" },
    });
    expect(result).toBeUndefined();
  });

  it("should allow grep by default", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "grep" },
      args: { pattern: "test" },
    });
    expect(result).toBeUndefined();
  });

  it("should allow glob by default", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "glob" },
      args: { pattern: "*.ts" },
    });
    expect(result).toBeUndefined();
  });

  it("should deny dangerous bash patterns", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "rm -rf /" },
    });
    expect(result).toEqual({
      block: true,
      reason: "Force-remove blocked",
    });
  });

  it("should deny sudo commands", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "sudo rm file" },
    });
    expect(result).toEqual({
      block: true,
      reason: "sudo blocked",
    });
  });

  it("should deny chmod 777", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "chmod 777 file" },
    });
    expect(result).toEqual({
      block: true,
      reason: "chmod 777 blocked",
    });
  });

  it("should deny disk operations (mkfs/dd)", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "dd if=/dev/zero of=/dev/sda" },
    });
    expect(result).toEqual({
      block: true,
      reason: "Disk operations blocked",
    });
  });

  it("should deny write_file to paths matching deny patterns", async () => {
    const pm = new PermissionManager(
      { ...defaultConfig, denyPatterns: ["**/secrets/**"] },
      createPromptFn(),
    );
    const result = await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/etc/secrets/password.txt", content: "hunter2" },
    });
    expect(result).toEqual({
      block: true,
      reason: "Denied by file pattern: **/secrets/**",
    });
  });

  it("should deny read_file from paths matching deny patterns", async () => {
    const pm = new PermissionManager(
      { ...defaultConfig, denyPatterns: ["**/.env*"] },
      createPromptFn(),
    );
    const result = await pm.check({
      toolCall: { name: "read_file" },
      args: { path: "/project/.env.local" },
    });
    expect(result).toEqual({
      block: true,
      reason: "Denied by file pattern: **/.env*",
    });
  });

  it("should ask for write_file by default", async () => {
    let prompted = false;
    const pm = new PermissionManager(defaultConfig, async (_toolName, _preview) => {
      prompted = true;
      return { decision: "allow", rememberForSession: false };
    });
    const result = await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/test.txt", content: "hello" },
    });
    expect(result).toBeUndefined();
    expect(prompted).toBe(true);
  });

  it("should ask for bash by default", async () => {
    let prompted = false;
    const pm = new PermissionManager(defaultConfig, async (_toolName, _preview) => {
      prompted = true;
      return { decision: "allow", rememberForSession: false };
    });
    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "ls -la" },
    });
    expect(result).toBeUndefined();
    expect(prompted).toBe(true);
  });

  it("passes toolCallId to the permission prompt", async () => {
    let promptContext: { toolCallId?: string } | undefined;
    const pm = new PermissionManager(
      defaultConfig,
      async (_toolName, _preview, _args, context) => {
        promptContext = context;
        return { decision: "allow", rememberForSession: false };
      },
    );

    await pm.check({
      toolCall: { id: "call-bash-1", name: "bash" },
      args: { command: "pwd" },
    });

    expect(promptContext).toEqual({ toolCallId: "call-bash-1" });
  });

  it("should deny when user denies prompt", async () => {
    const pm = new PermissionManager(defaultConfig, async () => ({
      decision: "deny",
      rememberForSession: false,
    }));
    const result = await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/test.txt", content: "hello" },
    });
    expect(result).toEqual({ block: true, reason: "Denied by user" });
  });

  it("should remember session grants", async () => {
    const pm = new PermissionManager(defaultConfig, async () => ({
      decision: "allow",
      rememberForSession: true,
    }));
    const first = await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/a.txt", content: "a" },
    });
    expect(first).toBeUndefined();

    let promptedAgain = false;
    const pm2 = new PermissionManager(defaultConfig, async () => {
      promptedAgain = true;
      return { decision: "allow", rememberForSession: false };
    });
    for (const g of pm.getSessionGrants()) {
      pm2.grantForSession(g);
    }
    const second = await pm2.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/b.txt", content: "b" },
    });
    expect(second).toBeUndefined();
    expect(promptedAgain).toBe(false);
  });

  it("should revoke session grants", () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    pm.grantForSession("write_file");
    expect(pm.getSessionGrants()).toContain("write_file");
    pm.revokeGrant("write_file");
    expect(pm.getSessionGrants()).not.toContain("write_file");
  });

  it("should use custom rules with priority", async () => {
    const pm = new PermissionManager(
      {
        ...defaultConfig,
        rules: [
          { tool: "bash", argPattern: "ls", decision: "allow", priority: 200 },
        ],
      },
      createPromptFn(),
    );
    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "ls -la" },
    });
    expect(result).toBeUndefined();
  });

  it("should use defaultDecision when no rule matches", async () => {
    const pm = new PermissionManager(
      { ...defaultConfig, defaultDecision: "deny" },
      createPromptFn(),
    );
    const result = await pm.check({
      toolCall: { name: "unknown_tool" },
      args: {},
    });
    expect(result).toEqual({ block: true, reason: "Denied by policy" });
  });

  it("should call onBeforePrompt callback", async () => {
    let called = false;
    const pm = new PermissionManager(defaultConfig, async () => ({
      decision: "allow",
      rememberForSession: false,
    }), undefined, () => { called = true; });
    await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/test.txt", content: "hello" },
    });
    expect(called).toBe(true);
  });

  it("sends a saved allow rule through the persistence port", async () => {
    let persisted: unknown;

    const pm = new PermissionManager(defaultConfig, async () => ({
      decision: "allow",
      persistRule: {
        tool: "bash",
        argPattern: "^\\{\\\"command\\\":\\\"npm test\\\"\\}$",
        decision: "allow",
        reason: "saved from permission prompt",
        priority: 20,
      },
    }), {
      persistRule: async (rule) => {
        persisted = rule;
      },
    });

    const result = await pm.check({
      toolCall: { name: "bash" },
      args: { command: "npm test" },
    });

    expect(result).toBeUndefined();
    expect(persisted).toMatchObject({
      tool: "bash",
      decision: "allow",
      priority: 20,
    });
  });

  describe("glob tool name patterns", () => {
    it("should match server-wide wildcard mcp__lsp__*", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          rules: [{ tool: "mcp__lsp__*", decision: "allow", priority: 50 }],
        },
        createPromptFn(),
      );
      const result = await pm.check({
        toolCall: { name: "mcp__lsp_textDocument_hover" },
        args: {},
      });
      expect(result).toBeUndefined();
    });

    it("should match all tools from a server with wildcard", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          rules: [{ tool: "mcp__lsp__*", decision: "allow", priority: 50 }],
        },
        createPromptFn(),
      );
      const r1 = await pm.check({ toolCall: { name: "mcp__lsp_textDocument_hover" }, args: {} });
      const r2 = await pm.check({ toolCall: { name: "mcp__lsp_textDocument_definition" }, args: {} });
      const r3 = await pm.check({ toolCall: { name: "mcp__lsp_window_showMessageRequest" }, args: {} });
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(r3).toBeUndefined();
    });

    it("should not cross server boundary with wildcard", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          defaultDecision: "deny",
          rules: [{ tool: "mcp__lsp__*", decision: "allow", priority: 50 }],
        },
        createPromptFn(),
      );
      const result = await pm.check({
        toolCall: { name: "mcp__github__search" },
        args: {},
      });
      expect(result).toEqual({ block: true, reason: "Denied by policy" });
    });

    it("should match mid-name wildcard mcp__*__search", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          rules: [{ tool: "mcp__*__search", decision: "allow", priority: 50 }],
        },
        createPromptFn(),
      );
      const r1 = await pm.check({ toolCall: { name: "mcp__github__search" }, args: {} });
      const r2 = await pm.check({ toolCall: { name: "mcp__lsp__search" }, args: {} });
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
    });

    it("should still support exact match without wildcard", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          rules: [{ tool: "bash", decision: "deny", priority: 100 }],
        },
        createPromptFn(),
      );
      const result = await pm.check({ toolCall: { name: "bash" }, args: { command: "ls" } });
      expect(result).toEqual({ block: true, reason: "Denied by policy" });
    });

    it("should still support global wildcard *", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          rules: [{ tool: "*", decision: "deny", priority: 100 }],
        },
        createPromptFn(),
      );
      const result = await pm.check({ toolCall: { name: "read_file" }, args: {} });
      expect(result).toEqual({ block: true, reason: "Denied by policy" });
    });

    it("should prefer exact match over glob with higher priority", async () => {
      const pm = new PermissionManager(
        {
          ...defaultConfig,
          rules: [
            { tool: "mcp__github__delete_repo", decision: "deny", priority: 100 },
            { tool: "mcp__github__*", decision: "allow", priority: 50 },
          ],
        },
        createPromptFn(),
      );
      const exact = await pm.check({ toolCall: { name: "mcp__github__delete_repo" }, args: {} });
      const glob = await pm.check({ toolCall: { name: "mcp__github__list_repos" }, args: {} });
      expect(exact).toEqual({ block: true, reason: "Denied by policy" });
      expect(glob).toBeUndefined();
    });
  });
});
