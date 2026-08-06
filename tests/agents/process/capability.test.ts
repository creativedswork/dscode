import { describe, expect, it } from "vitest";

import { checkAgentCapability } from "../../../src/agents/process/capability.js";
import { deriveAgentContext } from "../../../src/agents/process/context.js";
import type { AgentApplicationSnapshot } from "../../../src/agents/application/types.js";
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
    const planContext = deriveAgentContext({
      application: application({ permissionMode: "plan" }),
      parent: { ...parent, deniedTools: [] },
      availableTools: [...parent.allowedTools],
      attachment: "foreground",
    });
    const backgroundContext = deriveAgentContext({
      application: application(),
      parent: { ...parent, deniedTools: [] },
      availableTools: [...parent.allowedTools],
      attachment: "background",
    });

    expect(planContext.allowedTools).not.toContain("write_file");
    expect(planContext.allowedTools).not.toContain("bash");
    expect(backgroundContext.allowedTools).not.toContain("write_file");
    expect(backgroundContext.allowedTools).not.toContain("bash");
  });

  it("rejects file paths outside the Agent cwd", () => {
    const context = deriveAgentContext({
      application: application({ tools: ["read_file"] }),
      parent,
      availableTools: [...parent.allowedTools],
      attachment: "foreground",
    });

    expect(checkAgentCapability(context, "read_file", { path: "src/a.ts" })).toBeUndefined();
    expect(checkAgentCapability(context, "read_file", { path: "../secret" }))
      .toMatchObject({ block: true });
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
