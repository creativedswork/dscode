import { describe, expect, it } from "vitest";

import type { AgentActivity, UIMessage } from "../../src/ui/shared/types.js";
import {
  applyTraceFilters,
  filterTraceTreeByAgent,
  filterTraceTreeByDate,
  listTraceAgents,
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

  it("forks a SubAgent from its spawn_agent tool and sets a merge target", () => {
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
    // Merge target = the parent continuation node after the spawn, set on the
    // SubAgent path's tail node (the node where the path ends, per D3).
    const tail = agentChild!.children[agentChild!.children.length - 1];
    expect(tail.mergeTargetId).toBe("a2");
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

  it("lists Main plus every projected Agent", () => {
    const tree = projectTraceTree([
      message({
        id: "a",
        role: "agent",
        agentActivity: agentActivity({ agentId: "agent-x", label: "X" }),
      }),
    ]);
    expect(listTraceAgents(tree.root)).toEqual([
      { id: MAIN_AGENT_ID, label: "Main" },
      { id: "agent-x", label: "X" },
    ]);
  });
});

describe("trace filters", () => {
  function chainTree(): ReturnType<typeof projectTraceTree> {
    return projectTraceTree([
      message({ id: "u1", role: "user", content: "go", createdAt: 1000 }),
      message({ id: "a1", role: "assistant", content: "mid", createdAt: 3000 }),
      message({ id: "u2", role: "user", content: "end", createdAt: 5000 }),
    ]);
  }

  function buildTree(): ReturnType<typeof projectTraceTree> {
    return projectTraceTree([
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
        agentActivity: agentActivity({
          agentId: "agent-1",
          label: "Worker",
          createdAt: 3000,
          transcript: [
            message({ id: "w1", role: "user", content: "work", createdAt: 3100 }),
            message({
              id: "w2",
              role: "assistant",
              content: "",
              createdAt: 3200,
              tools: [{ toolCallId: "at1", name: "grep", args: "", result: "1 match", isError: false }],
            }),
          ],
        }),
      }),
    ]);
  }

  it("never date-filters an Agent root node", () => {
    const tree = chainTree();
    const filtered = filterTraceTreeByDate(tree.root, 5000, 6000);
    expect(filtered.kind).toBe("agent");
    expect(filtered.ghost).toBe(false);
  });

  it("keeps a ghost ancestor when a descendant matches the date window", () => {
    const tree = chainTree();
    const filtered = filterTraceTreeByDate(tree.root, 2000, 4000);
    // main → u1(1000, ghost) → a1(3000, kept) ; u2(5000) dropped.
    expect(filtered.children.map((n) => n.id)).toEqual(["u1"]);
    expect(filtered.children[0].ghost).toBe(true);
    expect(filtered.children[0].children.map((n) => n.id)).toEqual(["a1"]);
    expect(filtered.children[0].children[0].ghost).toBe(false);
  });

  it("shows only the selected Agent's nodes plus ghost ancestors", () => {
    const tree = buildTree();
    const filtered = filterTraceTreeByAgent(tree.root, "agent-1");
    const worker = findNode(filtered, "agent", "Worker");
    expect(worker).toBeDefined();
    expect(worker!.ghost).toBe(false);
    // Main-owned user/assistant ancestors are retained as ghosts for connectivity.
    expect(countKinds(filtered, "agent")).toBe(2);
    expect(findNode(filtered, "assistant", "Assistant")!.ghost).toBe(true);
  });

  it("combines Agent and date filters with AND semantics", () => {
    const tree = buildTree();
    const filtered = applyTraceFilters(tree.root, {
      ownerAgentId: "agent-1",
      from: 3150,
      to: 3300,
    });
    const worker = findNode(filtered, "agent", "Worker");
    expect(worker).toBeDefined();
    expect(worker!.ghost).toBe(false);
    // w1 (3100) is out of window and becomes a ghost ancestor of w2 (3200).
    expect(worker!.children[0].ghost).toBe(true);
  });

  it("restores the full tree when filters are cleared", () => {
    const tree = buildTree();
    const filtered = applyTraceFilters(tree.root, {});
    expect(countKinds(filtered, "user")).toBe(2);
    expect(countKinds(filtered, "assistant")).toBe(2);
    expect(countKinds(filtered, "agent")).toBe(2);
    expect(countKinds(filtered, "tool")).toBe(2);
  });
});
