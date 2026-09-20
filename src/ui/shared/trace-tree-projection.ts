// ── Backend Trace projection ──
// Projects the current Session's Main Agent messages plus every SubAgent
// transcript into a single Trace tree. Unlike the pure client projection, this
// entry loads persisted SubAgent process records and reuses
// `rebuildDisplayMessages` so each SubAgent's internal
// `user → assistant → tool → assistant` chain is reproduced. Read-only.

import type { SerializedAgentProcess } from "../../agents/process/types.js";
import type { AgentSessionMessage } from "../../session/types.js";
import { rebuildDisplayMessages } from "./session-projector.js";
import { projectTraceTree, type TraceTree } from "./trace-tree.js";
import type { ConversationMessage, UIMessage } from "./types.js";

export type TraceProcessLoader = (
  agentIds: readonly string[],
) => Promise<ReadonlyMap<string, SerializedAgentProcess>>;

export interface TraceProjectionOptions {
  messages: readonly unknown[];
  agentMessages: readonly AgentSessionMessage[];
  sessionId: string;
  loadProcesses: TraceProcessLoader;
  resolveImage?: (
    ref: { type: "image_ref"; hash: string; mimeType: string },
  ) => { readonly data: string; readonly mimeType: string } | undefined;
}

function toUIMessage(
  message: ConversationMessage,
  index: number,
  prefix: string,
): UIMessage {
  return {
    id: message.role === "agent" && message.agentActivity
      ? `agent-${message.agentActivity.agentId}`
      : message.id ?? `${prefix}-${message.role}-${index}`,
    role: message.role,
    content: message.content,
    thinking: message.thinking,
    tools: message.tools,
    images: message.images,
    createdAt: message.createdAt,
    agentActivity: message.agentActivity,
  };
}

export async function projectTraceTreeFromSession(
  options: TraceProjectionOptions,
): Promise<TraceTree> {
  const { messages, agentMessages, sessionId, loadProcesses, resolveImage } = options;
  const projectionOptions = resolveImage ? { resolveImage } : {};

  const subagentIds = [...new Set(agentMessages.map((m) => m.agentId))];
  const processes = await loadProcesses(subagentIds);
  const processById = new Map<string, SerializedAgentProcess>();
  for (const [id, record] of processes) processById.set(id, record);

  const subagentIdSet = new Set(subagentIds);
  const mainAgentId = agentMessages
    .map((m) => m.parentAgentId)
    .find((pid) => pid !== undefined && !subagentIdSet.has(pid));

  const isTopLevel = (m: AgentSessionMessage): boolean =>
    m.parentAgentId === undefined
    || m.parentAgentId === mainAgentId
    || !subagentIdSet.has(m.parentAgentId);

  const cache = new Map<string, UIMessage[]>();

  const buildTranscript = async (agentId: string): Promise<UIMessage[]> => {
    const cached = cache.get(agentId);
    if (cached) return cached;

    const process = processById.get(agentId);
    const raw = process?.runtimeSnapshot?.messages;
    const nested = agentMessages.filter((m) => m.parentAgentId === agentId);
    const display = rebuildDisplayMessages(
      Array.isArray(raw) ? raw : [],
      nested,
      sessionId,
      projectionOptions,
    );
    const converted = display.map((m, i) => toUIMessage(m, i, agentId));

    for (const msg of converted) {
      if (msg.role === "agent" && msg.agentActivity) {
        msg.agentActivity.transcript = await buildTranscript(msg.agentActivity.agentId);
      }
    }

    cache.set(agentId, converted);
    return converted;
  };

  const mainDisplay = rebuildDisplayMessages(
    [...messages],
    agentMessages.filter(isTopLevel),
    sessionId,
    projectionOptions,
  ).map((m, i) => toUIMessage(m, i, "main"));

  for (const msg of mainDisplay) {
    if (msg.role === "agent" && msg.agentActivity) {
      msg.agentActivity.transcript = await buildTranscript(msg.agentActivity.agentId);
    }
  }

  return projectTraceTree(mainDisplay);
}
