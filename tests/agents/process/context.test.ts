import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getAgentContext,
  resolveAgentPath,
  runWithAgentContext,
} from "../../../src/agents/process/context.js";
import type { AgentContext } from "../../../src/agents/process/types.js";
import { bashTool } from "../../../src/drivers/shell.js";
import {
  consumePendingNotices,
  recordInvalidation,
} from "../../../src/context/anchor-invalidation.js";

const temporaryDirectories: string[] = [];

function context(agentId: string, cwd: string): AgentContext {
  return {
    agentId,
    cwd,
    parentSessionId: "session",
    depth: 1,
    attachment: "foreground",
    allowedTools: ["bash"],
    deniedTools: [],
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("AgentContext AsyncLocalStorage", () => {
  it("keeps concurrent Agent cwd and identity isolated", async () => {
    const first = await mkdtemp(join(tmpdir(), "dscode-agent-a-"));
    const second = await mkdtemp(join(tmpdir(), "dscode-agent-b-"));
    temporaryDirectories.push(first, second);

    const [a, b] = await Promise.all([
      runWithAgentContext(context("agent-a", first), async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const result = await bashTool.execute("a", { command: "pwd" });
        return {
          path: resolveAgentPath("file.txt"),
          agentId: getAgentContext()?.agentId,
          pwd: (result.content[0] as { text: string }).text.trim(),
        };
      }),
      runWithAgentContext(context("agent-b", second), async () => {
        const result = await bashTool.execute("b", { command: "pwd" });
        return {
          path: resolveAgentPath("file.txt"),
          agentId: getAgentContext()?.agentId,
          pwd: (result.content[0] as { text: string }).text.trim(),
        };
      }),
    ]);

    expect(a.path).toBe(join(first, "file.txt"));
    expect(a.agentId).toBe("agent-a");
    expect(await realpath(a.pwd)).toBe(await realpath(first));
    expect(b.path).toBe(join(second, "file.txt"));
    expect(b.agentId).toBe("agent-b");
    expect(await realpath(b.pwd)).toBe(await realpath(second));
    expect(getAgentContext()).toBeUndefined();
  });

  it("isolates anchor invalidation notices by Agent identity", async () => {
    const first = context("agent-a", "/project-a");
    const second = context("agent-b", "/project-b");

    await runWithAgentContext(first, async () => {
      recordInvalidation("shared.ts", 1, "version-a");
    });
    await runWithAgentContext(second, async () => {
      recordInvalidation("shared.ts", 2, "version-b");
    });

    const firstNotice = await runWithAgentContext(first, async () => consumePendingNotices());
    const secondNotice = await runWithAgentContext(second, async () => consumePendingNotices());
    expect(firstNotice).toContain("version-a");
    expect(firstNotice).not.toContain("version-b");
    expect(secondNotice).toContain("version-b");
    expect(secondNotice).not.toContain("version-a");
  });
});
