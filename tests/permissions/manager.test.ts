import { describe, it, expect, beforeEach } from "vitest";
import { PermissionManager } from "../../src/permissions/manager.js";

function createPromptFn() {
  return async (_toolName: string, _preview: string) => ({
    decision: "allow" as const,
    rememberForSession: false,
  });
}

describe("PermissionManager", () => {
  let defaultConfig: Parameters<typeof PermissionManager.prototype.constructor>[0];

  beforeEach(() => {
    defaultConfig = {
      defaultDecision: "ask",
      rules: [],
      denyPatterns: [],
    };
  });

  it("should allow read_file by default", async () => {
    const pm = new PermissionManager(defaultConfig, createPromptFn());
    const result = await pm.check({
      toolCall: { name: "read_file" },
      args: { path: "/some/file.txt" },
    });
    expect(result).toBeUndefined(); // undefined = allowed
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
    // First call should prompt
    const first = await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/a.txt", content: "a" },
    });
    expect(first).toBeUndefined();

    // Second call should not prompt (session grant)
    let promptedAgain = false;
    const pm2 = new PermissionManager(defaultConfig, async () => {
      promptedAgain = true;
      return { decision: "allow", rememberForSession: false };
    });
    // Copy session grants
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
    // ls should be allowed despite default ask
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
    // unknown tool should be denied
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
    }), () => { called = true; });
    await pm.check({
      toolCall: { name: "write_file" },
      args: { path: "/tmp/test.txt", content: "hello" },
    });
    expect(called).toBe(true);
  });
});
