import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { checkAgentCapability } from "../../../src/agents/process/capability.js";
import { deriveAgentContext } from "../../../src/agents/process/context.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/definitions/types.js";
import type { AgentContext } from "../../../src/agents/process/types.js";

const parent: AgentContext = {
  agentId: "main",
  cwd: "/project",
  parentSessionId: "session",
  depth: 0,
  attachment: "foreground",
  allowedTools: ["read_file", "write_file", "bash", "mcp__demo__read"],
  deniedTools: ["bash"],
};

function application(
  overrides: Partial<AgentApplicationSnapshot> = {},
): AgentApplicationSnapshot {
  return {
    name: "child",
    description: "child",
    systemPrompt: "child",
    source: { kind: "bundled", path: "child.md" },
    digest: "a".repeat(64),
    registryGeneration: 1,
    ...overrides,
  };
}

describe("Agent capability monotonicity", () => {
  it("cannot re-enable a parent hard deny and treats MCP tools uniformly", () => {
    const context = deriveAgentContext({
      application: application({
        tools: ["*", "bash"],
        disallowedTools: ["write_file"],
      }),
      parent,
      availableTools: [...parent.allowedTools],
      attachment: "foreground",
    });

    expect(context.allowedTools).toEqual(["read_file", "mcp__demo__read"]);
    expect(context.deniedTools).toContain("bash");
    expect(context.deniedTools).toContain("write_file");
    expect(context.deniedTools).toContain("spawn_agent");
  });

  it("supports exact MCP tool names in an Agent Application allowlist", () => {
    const context = deriveAgentContext({
      application: application({ tools: ["mcp__demo__read"] }),
      parent: { ...parent, deniedTools: [] },
      availableTools: [...parent.allowedTools],
      attachment: "foreground",
    });

    expect(context.allowedTools).toEqual(["mcp__demo__read"]);
  });

  it("removes mutating tools from plan and unisolated background Agents", () => {
    const mutatingParent = {
      ...parent,
      allowedTools: [...parent.allowedTools, "edit_undo"],
    };
    const planContext = deriveAgentContext({
      application: application({ permissionMode: "plan" }),
      parent: { ...mutatingParent, deniedTools: [] },
      availableTools: [...mutatingParent.allowedTools],
      attachment: "foreground",
    });
    const backgroundContext = deriveAgentContext({
      application: application(),
      parent: { ...mutatingParent, deniedTools: [] },
      availableTools: [...mutatingParent.allowedTools],
      attachment: "background",
    });

    expect(planContext.allowedTools).not.toContain("write_file");
    expect(planContext.allowedTools).not.toContain("bash");
    expect(planContext.allowedTools).not.toContain("edit_undo");
    expect(backgroundContext.allowedTools).not.toContain("write_file");
    expect(backgroundContext.allowedTools).not.toContain("bash");
    expect(backgroundContext.allowedTools).not.toContain("edit_undo");
  });

  it("rejects lexical and symlink paths outside the Agent cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-capability-"));
    const outside = mkdtempSync(join(tmpdir(), "dscode-capability-outside-"));
    try {
      writeFileSync(join(root, "a.ts"), "local");
      writeFileSync(join(outside, "secret"), "secret");
      symlinkSync(outside, join(root, "escape"));
      const context = deriveAgentContext({
        application: application({ tools: ["read_file"] }),
        parent: { ...parent, cwd: root },
        availableTools: [...parent.allowedTools],
        attachment: "foreground",
      });

      expect(checkAgentCapability(context, "read_file", { path: "a.ts" }))
        .toBeUndefined();
      expect(checkAgentCapability(context, "read_file", { path: "../secret" }))
        .toMatchObject({ block: true });
      expect(checkAgentCapability(context, "read_file", {
        path: "escape/secret",
      })).toMatchObject({ block: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("preserves the capability subset property across tool combinations", () => {
    const tools = ["read_file", "write_file", "bash", "mcp__demo__read"];
    for (let parentMask = 0; parentMask < 16; parentMask++) {
      for (let denyMask = 0; denyMask < 16; denyMask++) {
        const parentAllowed = tools.filter((_, index) => parentMask & (1 << index));
        const parentDenied = tools.filter((_, index) => denyMask & (1 << index));
        const context = deriveAgentContext({
          application: application({ tools: ["*"] }),
          parent: {
            ...parent,
            allowedTools: parentAllowed,
            deniedTools: parentDenied,
          },
          availableTools: tools,
          attachment: "foreground",
        });

        for (const allowed of context.allowedTools) {
          expect(parentAllowed).toContain(allowed);
          expect(parentDenied).not.toContain(allowed);
        }
      }
    }
  });
});
