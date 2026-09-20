import { describe, expect, it } from "vitest";

import type { AgentActivity, UIMessage } from "../../src/ui/shared/types.js";
import {
  MAIN_AGENT_ID,
  projectTraceTree,
  type TraceNode,
} from "../../src/ui/shared/trace-tree.js";

function message(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: "m1",
    role: "user",
    content: "",
    ...overrides,
  };
}

function agentActivity(overrides: Partial<AgentActivity> = {}): AgentActivity {
  return {
    agentId: "agent-abc",
    parentSessionId: "session-1",
    application: "general",
    attachment: "foreground",
    state: "completed",
    input: "inspect behavior",
    createdAt: 2000,
    label: "Researcher",
    ...overrides,
  };
}

function findNode(root: TraceNode, kind: string, label?: string): TraceNode | undefined {
  if (root.kind === kind && (label === undefined || root.label === label)) return root;
  for (const child of root.children) {
    const found = findNode(child, kind, label);
    if (found) return found;
  }
  return undefined;
}

function countKinds(root: TraceNode, kind: string): number {
  let count = root.kind === kind ? 1 : 0;
  for (const child of root.children) count += countKinds(child, kind);
  return count;
}

describe("projectTraceTree", () => {
  it("roots at the Main Agent and chains messages in order", () => {
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "first", createdAt: 1000 }),
      message({ id: "a1", role: "assistant", content: "reply", createdAt: 2000 }),
      message({ id: "s1", role: "system", content: "", createdAt: 1500 }),
    ]);

    expect(tree.root.kind).toBe("agent");
    expect(tree.root.id).toBe(MAIN_AGENT_ID);
    expect(tree.root.label).toBe("Main");

    // main → user → assistant → system (chained, not flat siblings)
    expect(tree.root.children.map((n) => n.id)).toEqual(["u1"]);
    expect(tree.root.children[0].children.map((n) => n.id)).toEqual(["a1"]);
    expect(tree.root.children[0].children[0].children.map((n) => n.id)).toEqual(["s1"]);
  });

  it("merges tool call and result into a single tool node", () => {
    const tree = projectTraceTree([
      message({
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 2000,
        tools: [
          {
            toolCallId: "call-1",
            name: "read_file",
            args: 'path="README.md"',
            result: "ok",
            resultDetail: { summary: "ok", text: "ok" },
            isError: false,
          },
          {
            toolCallId: "call-2",
            name: "grep",
            args: 'pattern="x"',
            result: "",
            isError: false,
          },
        ],
      }),
    ]);

    const assistant = findNode(tree.root, "assistant");
    expect(assistant).toBeDefined();
    // Both tools are siblings under the assistant; no tool_result nodes.
    expect(assistant!.children.map((n) => n.kind)).toEqual(["tool", "tool"]);
    expect(assistant!.children.map((n) => n.label)).toEqual(["read_file", "grep"]);
    expect(countKinds(tree.root, "tool_result")).toBe(0);
  });

  it("continues the chain from the last tool of a multi-tool assistant", () => {
    const tree = projectTraceTree([
      message({
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 2000,
        tools: [
          { toolCallId: "t1", name: "bash", args: "", result: "x", isError: false },
          { toolCallId: "t2", name: "grep", args: "", result: "y", isError: false },
        ],
      }),
      message({ id: "u2", role: "user", content: "next", createdAt: 3000 }),
    ]);

    // u2 must hang off the LAST tool (t2), not the assistant.
    const lastTool = findNode(tree.root, "tool", "grep");
    expect(lastTool!.children.map((n) => n.id)).toEqual(["u2"]);
  });

  it("forks a SubAgent from its spawn_agent tool without a merge relation", () => {
    const tree = projectTraceTree([
      message({
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 1000,
        tools: [
          {
            toolCallId: "spawn-1",
            name: "spawn_agent",
            args: '{"application":"general"}',
            result: "Started background Agent agent-spawned",
            isError: false,
          },
        ],
      }),
      message({ id: "a2", role: "assistant", content: "after", createdAt: 2000 }),
      message({
        id: "agent-spawned",
        role: "agent",
        agentActivity: agentActivity({
          agentId: "agent-spawned",
          parentAgentId: "main-1",
          label: "Researcher",
          createdAt: 1500,
        }),
        createdAt: 1500,
      }),
    ]);

    const spawnTool = findNode(tree.root, "tool", "spawn_agent");
    expect(spawnTool).toBeDefined();
    const agentChild = spawnTool!.children.find((n) => n.kind === "agent");
    expect(agentChild).toBeDefined();
    expect(agentChild!.label).toBe("Researcher");
    expect(agentChild!.ownerAgentId).toBe("agent-spawned");
    // The parent path continues from the spawn tool's non-agent child — no
    // mergeTargetId data relation is produced.
    const continuation = spawnTool!.children.find((n) => n.kind !== "agent");
    expect(continuation).toBeDefined();
    expect(continuation!.id).toBe("a2");
  });

  it("projects a SubAgent transcript chain when provided", () => {
    const tree = projectTraceTree([
      message({
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 1000,
        tools: [
          {
            toolCallId: "spawn-1",
            name: "spawn_agent",
            args: "{}",
            result: "agent-1",
            isError: false,
          },
        ],
      }),
      message({
        id: "agent-1",
        role: "agent",
        agentActivity: agentActivity({
          agentId: "agent-1",
          label: "Worker",
          transcript: [
            message({ id: "w1", role: "user", content: "do work", createdAt: 1100 }),
            message({
              id: "w2",
              role: "assistant",
              content: "",
              createdAt: 1200,
              tools: [{ toolCallId: "wt1", name: "bash", args: "", result: "ok", isError: false }],
            }),
          ],
        }),
      }),
    ]);

    const worker = findNode(tree.root, "agent", "Worker");
    expect(worker).toBeDefined();
    // worker → user → assistant → tool (internal chain reproduced)
    expect(worker!.children.map((n) => n.kind)).toEqual(["user"]);
    expect(worker!.children[0].children.map((n) => n.kind)).toEqual(["assistant"]);
    expect(worker!.children[0].children[0].children.map((n) => n.kind)).toEqual(["tool"]);
  });

  it("assigns ownerAgentId to Main and SubAgent subtrees", () => {
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "go", createdAt: 1000 }),
      message({
        id: "a1",
        role: "assistant",
        content: "",
        createdAt: 2000,
        tools: [{ toolCallId: "t1", name: "bash", args: "", result: "x", isError: false }],
      }),
      message({
        id: "agent-1",
        role: "agent",
        agentActivity: agentActivity({ agentId: "agent-1", label: "Worker", createdAt: 3000 }),
      }),
    ]);

    const user = findNode(tree.root, "user");
    expect(user!.ownerAgentId).toBe(MAIN_AGENT_ID);
    const worker = findNode(tree.root, "agent", "Worker");
    expect(worker!.ownerAgentId).toBe("agent-1");
  });

  it("summarizes message and subagent counts on the root", () => {
    const tree = projectTraceTree([
      message({ id: "u1", role: "user", content: "go", createdAt: 1000 }),
      message({
        id: "agent-1",
        role: "agent",
        agentActivity: agentActivity({ agentId: "agent-1", label: "Worker", createdAt: 2000 }),
      }),
    ]);
    expect(tree.root.detail?.summary).toBe("1 messages · 1 subagent");
  });
});

describe("assignLanes", () => {
  function spawnTool(toolCallId: string, result: string) {
    return { toolCallId, name: "spawn_agent", args: "{}", result, isError: false };
  }

  it("assigns a fresh, unrecycled lane to each sibling SubAgent", () => {
    const tree = projectTraceTree([
      message({
        id: "a1", role: "assistant", content: "", createdAt: 1000,
        tools: [spawnTool("s1", "Started agent-1")],
      }),
      message({ id: "a2", role: "assistant", content: "after1", createdAt: 2000 }),
      message({
        id: "a3", role: "assistant", content: "", createdAt: 3000,
        tools: [spawnTool("s2", "Started agent-2")],
      }),
      message({ id: "a4", role: "assistant", content: "after2", createdAt: 4000 }),
      message({
        id: "agent-1", role: "agent",
        agentActivity: agentActivity({
          agentId: "agent-1", label: "W1", createdAt: 1500,
          transcript: [message({ id: "w1", role: "user", content: "x", createdAt: 1510 })],
        }),
      }),
      message({
        id: "agent-2", role: "agent",
        agentActivity: agentActivity({
          agentId: "agent-2", label: "W2", createdAt: 3500,
          transcript: [message({ id: "w2", role: "user", content: "y", createdAt: 3510 })],
        }),
      }),
    ]);

    const w1 = findNode(tree.root, "agent", "W1");
    const w2 = findNode(tree.root, "agent", "W2");
    expect(w1).toBeDefined();
    expect(w2).toBeDefined();
    // Each fork gets its own lane; lanes are never recycled.
    expect(w1!.lane).toBe(1);
    expect(w2!.lane).toBe(2);
    // The Main spine stays on lane 0.
    expect(tree.root.lane).toBe(0);
    expect(findNode(tree.root, "assistant", "Assistant")!.lane).toBe(0);
  });

  it("gives a nested SubAgent a further lane while the outer is active", () => {
    const tree = projectTraceTree([
      message({
        id: "a1", role: "assistant", content: "", createdAt: 1000,
        tools: [spawnTool("s1", "Started agent-1")],
      }),
      message({ id: "a2", role: "assistant", content: "after", createdAt: 2000 }),
      message({
        id: "agent-1", role: "agent",
        agentActivity: agentActivity({
          agentId: "agent-1", label: "Outer", createdAt: 1500,
          transcript: [
            message({ id: "w1", role: "user", content: "work", createdAt: 1510 }),
            message({
              id: "w2", role: "assistant", content: "", createdAt: 1520,
              tools: [spawnTool("s2", "Started agent-inner")],
            }),
            message({
              id: "agent-inner", role: "agent",
              agentActivity: agentActivity({
                agentId: "agent-inner", label: "Inner", createdAt: 1530,
                transcript: [message({ id: "i1", role: "user", content: "deep", createdAt: 1540 })],
              }),
            }),
          ],
        }),
      }),
    ]);

    const outer = findNode(tree.root, "agent", "Outer");
    const inner = findNode(tree.root, "agent", "Inner");
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();
    expect(outer!.lane).toBe(1);
    // A nested fork must get its own lane, not reuse the outer's.
    expect(inner!.lane).toBe(2);
  });

  it("keeps ownerAgentId intact across lane assignment", () => {
    const tree = projectTraceTree([
      message({
        id: "a1", role: "assistant", content: "", createdAt: 1000,
        tools: [spawnTool("s1", "Started agent-1")],
      }),
      message({ id: "a2", role: "assistant", content: "after", createdAt: 2000 }),
      message({
        id: "agent-1", role: "agent",
        agentActivity: agentActivity({
          agentId: "agent-1", label: "W1", createdAt: 1500,
          transcript: [message({ id: "w1", role: "user", content: "x", createdAt: 1510 })],
        }),
      }),
    ]);

    const w1 = findNode(tree.root, "agent", "W1");
    expect(w1!.ownerAgentId).toBe("agent-1");
    expect(w1!.children[0].ownerAgentId).toBe("agent-1");
    expect(findNode(tree.root, "assistant", "Assistant")!.ownerAgentId).toBe(MAIN_AGENT_ID);
  });
});
