// ── Trace tree projection ──
// Pure projection of display-ready `UIMessage[]` into an interactive
// trajectory tree rooted at the Main Agent. Messages are chained in
// historical order (parent = the node they answer), SubAgents fork from a
// `spawn_agent` tool node and merge back into the parent path. Read-only:
// never mutates messages and never spawns Agents.

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
  /** SubAgent tail node merges (dashed) back to this parent-path node. */
  mergeTargetId?: string;
}

export interface TraceTree {
  root: TraceNode;
}

export interface TraceAgentOption {
  id: string;
  label: string;
}

export interface TraceFilters {
  from?: number;
  to?: number;
  ownerAgentId?: string;
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
  spine: TraceNode[];
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

function lastSpineNode(path: PathResult): TraceNode {
  return path.spine[path.spine.length - 1];
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
  const spine: TraceNode[] = [root];
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
    spine.push(node);
    tail = node;

    if (message.role === "assistant" && message.tools && message.tools.length > 0) {
      const toolNodes = message.tools.map((tool) =>
        buildMainToolNode(message, tool, agentId),
      );
      for (const toolNode of toolNodes) {
        node.children.push(toolNode);
        toolNode.parentId = node.id;
        spine.push(toolNode);
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

    if (spawnParent) {
      const spawnIndex = spine.indexOf(spawnParent);
      const mergeTarget = spawnIndex >= 0 ? spine[spawnIndex + 1] : undefined;
      if (mergeTarget) {
        lastSpineNode(child).mergeTargetId = mergeTarget.id;
      }
    }
  }

  return { root, spawnTools, spine };
}

export function projectTraceTree(messages: readonly UIMessage[]): TraceTree {
  const mainMessageCount = messages.filter((m) => m.role !== "agent").length;
  const path = projectPath(MAIN_AGENT_ID, messages);

  assignLanes(path.root);
  const subagentCount = listTraceAgents(path.root).length - 1;
  path.root.detail = {
    ...path.root.detail,
    title: "Main Agent",
    summary: `${mainMessageCount} messages · ${subagentCount} ${subagentCount === 1 ? "subagent" : "subagents"}`,
  };

  return { root: path.root };
}

function assignLanes(root: TraceNode): void {
  let lane = 0;
  const walk = (node: TraceNode): void => {
    if (node.kind === "agent") node.lane = lane++;
    node.children.forEach(walk);
  };
  walk(root);
}

// ── Agent listing ──

export function listTraceAgents(root: TraceNode): TraceAgentOption[] {
  const options: TraceAgentOption[] = [{ id: MAIN_AGENT_ID, label: root.label || "Main" }];
  const seen = new Set<string>([MAIN_AGENT_ID]);
  const walk = (node: TraceNode): void => {
    if (node.kind === "agent" && !seen.has(node.ownerAgentId)) {
      seen.add(node.ownerAgentId);
      options.push({ id: node.ownerAgentId, label: node.label });
    }
    node.children.forEach(walk);
  };
  walk(root);
  return options;
}

// ── Filtering ──

function filterTree(
  root: TraceNode,
  matches: (node: TraceNode) => boolean,
): TraceNode {
  const hasMatch = (node: TraceNode): boolean =>
    matches(node) || node.children.some(hasMatch);
  const clone = (node: TraceNode): TraceNode => ({
    ...node,
    ghost: node.ghost === true || !matches(node),
    children: node.children.filter(hasMatch).map(clone),
  });
  return clone(root);
}

export function filterTraceTreeByDate(
  root: TraceNode,
  from?: number,
  to?: number,
): TraceNode {
  const min = from ?? Number.NEGATIVE_INFINITY;
  const max = to ?? Number.POSITIVE_INFINITY;
  return filterTree(root, (node) => {
    // Agent path roots are timeless structural nodes — never date-filtered.
    if (node.kind === "agent") return true;
    if (node.ts === undefined) return true;
    return node.ts >= min && node.ts <= max;
  });
}

export function filterTraceTreeByAgent(
  root: TraceNode,
  ownerAgentId?: string,
): TraceNode {
  if (!ownerAgentId) return filterTree(root, () => true);
  return filterTree(root, (node) => {
    if (node.id === root.id) return true;
    return node.ownerAgentId === ownerAgentId;
  });
}

export function applyTraceFilters(
  root: TraceNode,
  filters: TraceFilters,
): TraceNode {
  const { from, to, ownerAgentId } = filters;
  const min = from ?? Number.NEGATIVE_INFINITY;
  const max = to ?? Number.POSITIVE_INFINITY;
  return filterTree(root, (node) => {
    const inRange = node.kind === "agent"
      || node.ts === undefined
      || (node.ts >= min && node.ts <= max);
    const ownerOk = node.id === root.id
      || !ownerAgentId
      || node.ownerAgentId === ownerAgentId;
    return inRange && ownerOk;
  });
}
