// ── Trace tree projection ──
// Pure projection of display-ready `UIMessage[]` into an interactive
// trajectory tree rooted at the Main Agent. Messages are chained in
// historical order (parent = the node they answer), SubAgents fork from a
// `spawn_agent` tool node and are rendered back onto the parent path as a
// pure visual return (no merge data relation). Read-only: never mutates
// messages and never spawns Agents.

import { formatAgentDisplayId } from "./agent-id.js";
import type {
  AgentActivity,
  AgentToolActivity,
  ToolCallEntry,
  UIMessage,
} from "./types.js";

export type TraceNodeKind =
  | "agent"
  | "user"
  | "assistant"
  | "tool"
  | "system";

export type TracePayloadRef =
  | { type: "message"; messageId: string }
  | { type: "tool"; messageId?: string; agentId?: string; toolCallId: string }
  | { type: "agent"; agentId: string };

export interface TraceNodeDetail {
  title?: string;
  content?: string;
  thinking?: string;
  toolName?: string;
  args?: string;
  result?: string;
  resultText?: string;
  role?: string;
  application?: string;
  state?: string;
  input?: string;
  output?: string;
  error?: string;
  summary?: string;
}

export interface TraceNode {
  id: string;
  kind: TraceNodeKind;
  label: string;
  sub?: string;
  ts?: number;
  parentId?: string;
  ownerAgentId: string;
  lane: number;
  children: TraceNode[];
  ghost?: boolean;
  unattached?: boolean;
  isError?: boolean;
  state?: string;
  payloadRef?: TracePayloadRef;
  detail?: TraceNodeDetail;
}

export interface TraceTree {
  root: TraceNode;
}

export const MAIN_AGENT_ID = "main";

const SUB_LABEL_MAX = 28;

function truncate(value: string | undefined, max = SUB_LABEL_MAX): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function messageNodeId(message: UIMessage): string {
  return message.id || `${message.role}-${message.createdAt ?? "unknown"}`;
}

function toolNodeId(messageId: string, toolCallId: string): string {
  return `${messageId}::tool:${toolCallId}`;
}

function agentToolNodeId(agentId: string, toolCallId: string): string {
  return `${agentId}::tool:${toolCallId}`;
}

function toolResultSummary(
  resultDetail: { summary?: string } | undefined,
  fallback?: string,
): string | undefined {
  return resultDetail?.summary ?? truncate(fallback, 40);
}

function agentFailed(activity: AgentActivity): boolean {
  return activity.state === "failed"
    || activity.state === "terminated"
    || activity.state === "killed"
    || Boolean(activity.error);
}

// ── Node builders ──

function buildMessageNode(
  message: UIMessage,
  ownerAgentId: string,
): TraceNode {
  const id = messageNodeId(message);
  const label = message.role === "user"
    ? "User"
    : message.role === "assistant"
      ? "Assistant"
      : "System";
  return {
    id,
    kind: message.role,
    label,
    sub: truncate(message.content || undefined),
    ts: message.createdAt,
    ownerAgentId,
    lane: 0,
    children: [],
    payloadRef: { type: "message", messageId: id },
    detail: {
      title: label,
      content: message.content,
      thinking: message.thinking,
    },
  };
}

function buildMainToolNode(
  message: UIMessage,
  tool: ToolCallEntry,
  ownerAgentId: string,
): TraceNode {
  return {
    id: toolNodeId(messageNodeId(message), tool.toolCallId),
    kind: "tool",
    label: tool.name,
    sub: truncate(tool.args || undefined),
    ts: message.createdAt,
    ownerAgentId,
    lane: 0,
    children: [],
    isError: tool.isError,
    payloadRef: { type: "tool", messageId: messageNodeId(message), toolCallId: tool.toolCallId },
    detail: {
      title: tool.name,
      toolName: tool.name,
      args: tool.args,
      result: toolResultSummary(tool.resultDetail, tool.result),
      resultText: tool.resultDetail?.text,
    },
  };
}

function buildAgentToolNode(
  agentId: string,
  tool: AgentToolActivity,
): TraceNode {
  return {
    id: agentToolNodeId(agentId, tool.toolCallId),
    kind: "tool",
    label: tool.name,
    sub: truncate(tool.args ?? tool.summary),
    ts: tool.startedAt,
    ownerAgentId: agentId,
    lane: 0,
    children: [],
    state: tool.status,
    isError: tool.isError,
    payloadRef: { type: "tool", agentId, toolCallId: tool.toolCallId },
    detail: {
      title: tool.name,
      toolName: tool.name,
      args: tool.args,
      result: toolResultSummary(tool.resultDetail, tool.summary),
      resultText: tool.resultDetail?.text,
    },
  };
}

function buildAgentNode(activity: AgentActivity | undefined, agentId = MAIN_AGENT_ID): TraceNode {
  if (!activity) {
    return {
      id: agentId,
      kind: "agent",
      label: "Main",
      sub: "Main Agent",
      ownerAgentId: MAIN_AGENT_ID,
      lane: 0,
      children: [],
      payloadRef: { type: "agent", agentId },
      detail: { title: "Main Agent", role: "Main", summary: "Main Agent trajectory" },
    };
  }

  const roleLabel = activity.label ?? agentId;
  return {
    id: agentId,
    kind: "agent",
    label: roleLabel,
    sub: formatAgentDisplayId(agentId),
    ts: activity.createdAt,
    ownerAgentId: agentId,
    lane: 0,
    children: [],
    state: activity.state,
    isError: agentFailed(activity),
    payloadRef: { type: "agent", agentId },
    detail: {
      title: roleLabel,
      role: roleLabel,
      application: activity.application,
      state: activity.state,
      input: activity.input,
      output: activity.output,
      error: activity.error,
    },
  };
}

function buildAgentToolEntry(tool: AgentToolActivity): ToolCallEntry {
  return {
    toolCallId: tool.toolCallId,
    name: tool.name,
    args: tool.args ?? tool.summary ?? "",
    result: tool.resultDetail?.summary ?? "",
    resultDetail: tool.resultDetail,
    isError: tool.isError ?? false,
  };
}

// Fallback "input → tools → output" when a SubAgent transcript is missing.
function synthesizeFallbackMessages(activity: AgentActivity): UIMessage[] {
  const messages: UIMessage[] = [];
  const base = activity.createdAt;

  messages.push({
    id: `${activity.agentId}:input`,
    role: "user",
    content: activity.input,
    createdAt: base,
  });

  if (activity.tools && activity.tools.length > 0) {
    messages.push({
      id: `${activity.agentId}:assistant`,
      role: "assistant",
      content: "",
      createdAt: activity.startedAt ?? base,
      tools: activity.tools.map(buildAgentToolEntry),
    });
  }

  if (activity.output || activity.error) {
    messages.push({
      id: `${activity.agentId}:output`,
      role: "assistant",
      content: activity.output ?? "",
      thinking: activity.error,
      createdAt: activity.endedAt,
    });
  }

  return messages;
}

// ── Projection ──

interface PathResult {
  root: TraceNode;
  spawnTools: TraceNode[];
}

function spawnToolReferencesAgent(toolNode: TraceNode, agentId: string): boolean {
  const text = `${toolNode.detail?.resultText ?? ""}\n${toolNode.detail?.result ?? ""}`;
  return text.includes(agentId);
}

function findSpawnParent(
  agentNode: TraceNode,
  agentId: string,
  spawnToolNodes: TraceNode[],
  claimed: Set<string>,
): TraceNode | undefined {
  for (const toolNode of spawnToolNodes) {
    if (!claimed.has(toolNode.id) && spawnToolReferencesAgent(toolNode, agentId)) {
      claimed.add(toolNode.id);
      return toolNode;
    }
  }
  let fallback: TraceNode | undefined;
  for (const toolNode of spawnToolNodes) {
    if (claimed.has(toolNode.id)) continue;
    if ((toolNode.ts ?? 0) <= (agentNode.ts ?? Number.POSITIVE_INFINITY)) {
      fallback = toolNode;
    }
  }
  if (fallback) claimed.add(fallback.id);
  return fallback;
}

function projectPath(
  agentId: string,
  messages: readonly UIMessage[],
  activity?: AgentActivity,
  claimedSpawnIds?: Set<string>,
): PathResult {
  const claimed = claimedSpawnIds ?? new Set<string>();
  const root = activity
    ? buildAgentNode(activity, agentId)
    : buildAgentNode(undefined, agentId);

  const spawnTools: TraceNode[] = [];
  const pendingAgents: { message: UIMessage; activity: AgentActivity }[] = [];

  let tail: TraceNode = root;

  for (const message of messages) {
    if (message.role === "agent" && message.agentActivity) {
      pendingAgents.push({ message, activity: message.agentActivity });
      continue;
    }

    const node = buildMessageNode(message, agentId);
    tail.children.push(node);
    node.parentId = tail.id;
    tail = node;

    if (message.role === "assistant" && message.tools && message.tools.length > 0) {
      const toolNodes = message.tools.map((tool) =>
        buildMainToolNode(message, tool, agentId),
      );
      for (const toolNode of toolNodes) {
        node.children.push(toolNode);
        toolNode.parentId = node.id;
        if (toolNode.label === "spawn_agent") spawnTools.push(toolNode);
      }
      tail = toolNodes[toolNodes.length - 1];
    }
  }

  for (const { activity: childActivity } of pendingAgents) {
    const transcript = childActivity.transcript ?? synthesizeFallbackMessages(childActivity);
    const child = projectPath(childActivity.agentId, transcript, childActivity, claimed);

    const spawnParent = findSpawnParent(child.root, childActivity.agentId, spawnTools, claimed);
    const attachPoint = spawnParent ?? tail;
    attachPoint.children.push(child.root);
    child.root.parentId = attachPoint.id;
    if (!spawnParent) child.root.unattached = true;
  }

  return { root, spawnTools };
}

export function projectTraceTree(messages: readonly UIMessage[]): TraceTree {
  const mainMessageCount = messages.filter((m) => m.role !== "agent").length;
  const path = projectPath(MAIN_AGENT_ID, messages);

  assignLanes(path.root);

  let subagentCount = 0;
  const countSubAgents = (node: TraceNode): void => {
    if (node.kind === "agent" && node.ownerAgentId !== MAIN_AGENT_ID) subagentCount += 1;
    node.children.forEach(countSubAgents);
  };
  countSubAgents(path.root);

  path.root.detail = {
    ...path.root.detail,
    title: "Main Agent",
    summary: `${mainMessageCount} messages · ${subagentCount} ${subagentCount === 1 ? "subagent" : "subagents"}`,
  };

  return { root: path.root };
}

function assignLanes(root: TraceNode): void {
  // Main Agent stays on lane 0; each `spawn_agent` fork receives a fresh,
  // monotonically increasing lane that is never recycled. Continuation
  // children inherit their parent's lane. Fork-first traversal keeps lane
  // numbers aligned with the renderer's fork-first row order.
  let nextLane = 0;
  const visit = (node: TraceNode, lane: number): void => {
    node.lane = lane;
    const forks = node.children.filter((c) => c.kind === "agent");
    const continuation = node.children.filter((c) => c.kind !== "agent");
    for (const child of forks) visit(child, ++nextLane);
    for (const child of continuation) visit(child, lane);
  };
  visit(root, 0);
}
