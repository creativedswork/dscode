import type { AgentProcessApplicationPort } from "../application/harness-api.js";
import type {
  AgentProcessState,
  SerializedAgentProcess,
} from "../agents/process/types.js";
import type {
  AgentSessionMessage,
  SerializedSession,
} from "../session/types.js";

export type TrajectoryEvidenceQuality = "full" | "summary" | "missing";
export type TrajectoryStepKind =
  | "response"
  | "tool_call"
  | "spawn"
  | "exit"
  | "summary";
export type TrajectoryEdgeType = "control" | "data" | "result";

export interface TrajectoryActor {
  agentId: string;
  application: string;
  role: "main" | "subagent";
  parentAgentId?: string;
  applicationSource?: string;
  applicationDigest?: string;
  evidenceQuality: TrajectoryEvidenceQuality;
  state?: AgentProcessState;
  createdAt?: number;
  startedAt?: number;
  endedAt?: number;
}

export interface TrajectoryStep {
  stepId: number;
  agentId: string;
  application: string;
  role: "main" | "subagent";
  parentAgentId?: string;
  kind: TrajectoryStepKind;
  toolName?: string;
  observation: string;
  thought: string;
  action: string;
  result: string;
  sourceMessageIndex?: number;
  timestamp: number;
  localOrder: number;
  isError: boolean;
  evidenceQuality: Exclude<TrajectoryEvidenceQuality, "missing">;
}

export interface TrajectoryEdge {
  id: string;
  type: TrajectoryEdgeType;
  fromStep: number;
  toStep: number;
  fromAgentId: string;
  toAgentId: string;
  label: string;
  evidenceQuality: Exclude<TrajectoryEvidenceQuality, "missing">;
}

export interface TrajectoryEvidenceSummary {
  totalActors: number;
  subagentCount: number;
  fullTranscripts: number;
  summaryTranscripts: number;
  missingTranscripts: number;
  completeness: "complete" | "partial";
  affectedAgentIds: string[];
}

export interface MultiAgentTrajectory {
  session: SerializedSession;
  actors: TrajectoryActor[];
  steps: TrajectoryStep[];
  controlEdges: TrajectoryEdge[];
  dataEdges: TrajectoryEdge[];
  evidence: TrajectoryEvidenceSummary;
}

interface PendingStep extends Omit<TrajectoryStep, "stepId"> {}

interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

interface ToolResult {
  toolCallId?: string;
  content: string;
  isError: boolean;
}

const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

function timestampOf(message: Record<string, unknown>, fallback: number): number {
  const value = message["timestamp"] ?? message["createdAt"];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function textOf(message: Record<string, unknown>): string {
  const content = message["content"];
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is Record<string, unknown> =>
      !!block && typeof block === "object" && !Array.isArray(block),
    )
    .filter((block) => block["type"] === "text")
    .map((block) => String(block["text"] ?? ""))
    .join("\n");
}

function thinkingOf(message: Record<string, unknown>): string {
  if (typeof message["thinking"] === "string") return message["thinking"];
  const content = message["content"];
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is Record<string, unknown> =>
      !!block && typeof block === "object" && !Array.isArray(block),
    )
    .filter((block) => block["type"] === "thinking")
    .map((block) => String(block["thinking"] ?? block["text"] ?? ""))
    .join("\n");
}

function toolCallsOf(message: Record<string, unknown>): ToolCall[] {
  const content = message["content"];
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (
      !block
      || typeof block !== "object"
      || Array.isArray(block)
      || (block as Record<string, unknown>)["type"] !== "toolCall"
    ) return [];
    const record = block as Record<string, unknown>;
    const args = record["arguments"];
    return [{
      id: typeof record["id"] === "string" ? record["id"] : undefined,
      name: String(record["name"] ?? "unknown"),
      args: args && typeof args === "object" && !Array.isArray(args)
        ? args as Record<string, unknown>
        : {},
    }];
  });
}

function resultOf(message: Record<string, unknown>): ToolResult | undefined {
  if (message["role"] !== "toolResult") return undefined;
  const details = message["details"];
  return {
    toolCallId: typeof message["toolCallId"] === "string"
      ? message["toolCallId"]
      : undefined,
    content: textOf(message),
    isError: message["isError"] === true
      || !!(details && typeof details === "object"
        && !Array.isArray(details)
        && (details as Record<string, unknown>)["error"]),
  };
}

function summarizeArgs(args: Record<string, unknown>): string {
  return Object.entries(args).slice(0, 4).map(([key, value]) => {
    const rendered = typeof value === "string" ? value : JSON.stringify(value);
    return `${key}=${clip(rendered ?? "", 120)}`;
  }).join(", ");
}

function sourceLabel(process: SerializedAgentProcess | undefined): string | undefined {
  const source = process?.application.source;
  if (!source) return undefined;
  return `${source.kind}:${source.path}`;
}

function transcriptSteps(
  messages: unknown[],
  actor: TrajectoryActor,
  baseTimestamp: number,
): PendingStep[] {
  const records = messages.filter((message): message is Record<string, unknown> =>
    !!message && typeof message === "object" && !Array.isArray(message),
  );
  const resultById = new Map<string, ToolResult>();
  for (const message of records) {
    const result = resultOf(message);
    if (result?.toolCallId) resultById.set(result.toolCallId, result);
  }

  const steps: PendingStep[] = [];
  let observation = "";
  let localOrder = 0;
  for (let index = 0; index < records.length; index++) {
    const message = records[index];
    const role = String(message["role"] ?? "");
    if (role === "user") {
      observation = clip(textOf(message), 4_000);
      continue;
    }
    if (role === "toolResult") {
      observation = clip(resultOf(message)?.content ?? "", 4_000);
      continue;
    }
    if (role !== "assistant") continue;

    const thinking = clip(thinkingOf(message), 4_000);
    const text = clip(textOf(message), 8_000);
    const toolCalls = toolCallsOf(message);
    const timestamp = timestampOf(message, baseTimestamp + localOrder);
    if (toolCalls.length === 0) {
      if (!thinking && !text) continue;
      steps.push({
        agentId: actor.agentId,
        application: actor.application,
        role: actor.role,
        parentAgentId: actor.parentAgentId,
        kind: "response",
        observation,
        thought: thinking,
        action: "respond",
        result: text,
        sourceMessageIndex: index,
        timestamp,
        localOrder: localOrder++,
        isError: false,
        evidenceQuality: "full",
      });
      observation = "";
      continue;
    }

    const followingResults: ToolResult[] = [];
    for (let next = index + 1; next < records.length; next++) {
      const nextRole = records[next]["role"];
      if (nextRole !== "toolResult") break;
      const result = resultOf(records[next]);
      if (result) followingResults.push(result);
    }
    for (let toolIndex = 0; toolIndex < toolCalls.length; toolIndex++) {
      const toolCall = toolCalls[toolIndex];
      const result = (toolCall.id && resultById.get(toolCall.id))
        || followingResults[toolIndex];
      const args = summarizeArgs(toolCall.args);
      steps.push({
        agentId: actor.agentId,
        application: actor.application,
        role: actor.role,
        parentAgentId: actor.parentAgentId,
        kind: toolCall.name === "spawn_agent" ? "spawn" : "tool_call",
        toolName: toolCall.name,
        observation: observation || text,
        thought: thinking,
        action: args ? `${toolCall.name}(${args})` : toolCall.name,
        result: clip(result?.content ?? "", 8_000),
        sourceMessageIndex: index,
        timestamp: timestamp + toolIndex,
        localOrder: localOrder++,
        isError: result?.isError ?? false,
        evidenceQuality: "full",
      });
      observation = clip(result?.content ?? "", 4_000);
    }
  }
  return steps;
}

function latestSummaries(messages: readonly AgentSessionMessage[]): AgentSessionMessage[] {
  const latest = new Map<string, AgentSessionMessage>();
  for (const message of messages) {
    const current = latest.get(message.agentId);
    if (!current || message.endedAt >= current.endedAt) latest.set(message.agentId, message);
  }
  return [...latest.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.agentId.localeCompare(b.agentId),
  );
}

function summaryHasEvidence(summary: AgentSessionMessage): boolean {
  return !!(
    summary.input.prompt
    || summary.output?.text
    || summary.output?.error
    || summary.input.attachments?.length
  );
}

function stableMainId(session: SerializedSession, summaries: AgentSessionMessage[]): string {
  const parents = [...new Set(
    summaries.map((summary) => summary.parentAgentId).filter(
      (value): value is string => !!value,
    ),
  )];
  return parents.length === 1 ? parents[0] : `main-session-${session.metadata.id}`;
}

function addEdge(
  edges: TrajectoryEdge[],
  type: TrajectoryEdgeType,
  from: TrajectoryStep,
  to: TrajectoryStep,
  label: string,
): void {
  if (from.stepId === to.stepId) return;
  edges.push({
    id: `${type}:${from.stepId}:${to.stepId}:${edges.length}`,
    type,
    fromStep: from.stepId,
    toStep: to.stepId,
    fromAgentId: from.agentId,
    toAgentId: to.agentId,
    label,
    evidenceQuality: from.evidenceQuality === "summary"
      || to.evidenceQuality === "summary"
      ? "summary"
      : "full",
  });
}

function buildEdges(
  steps: TrajectoryStep[],
  actors: TrajectoryActor[],
): { controlEdges: TrajectoryEdge[]; dataEdges: TrajectoryEdge[] } {
  const controlEdges: TrajectoryEdge[] = [];
  const dataEdges: TrajectoryEdge[] = [];
  for (const actor of actors) {
    const actorSteps = steps.filter((step) => step.agentId === actor.agentId);
    for (let index = 1; index < actorSteps.length; index++) {
      addEdge(controlEdges, "control", actorSteps[index - 1], actorSteps[index], "actor sequence");
      const previousResult = actorSteps[index - 1].result.trim();
      if (
        previousResult.length >= 8
        && actorSteps[index].observation.includes(previousResult.slice(0, 120))
      ) {
        addEdge(dataEdges, "data", actorSteps[index - 1], actorSteps[index], "tool result consumed");
      }
    }
  }

  const mainSteps = steps.filter((step) => step.role === "main");
  for (const actor of actors.filter((candidate) => candidate.role === "subagent")) {
    const actorSteps = steps.filter((step) => step.agentId === actor.agentId);
    const first = actorSteps[0];
    if (!first) continue;
    const spawn = [...mainSteps].reverse().find((step) =>
      step.kind === "spawn"
      && step.timestamp <= (actor.createdAt ?? first.timestamp)
      && (
        step.result.includes(actor.agentId)
        || step.action.includes(actor.application)
      ),
    ) ?? [...mainSteps].reverse().find((step) =>
      step.kind === "spawn" && step.timestamp <= (actor.createdAt ?? first.timestamp),
    );
    if (spawn) addEdge(controlEdges, "control", spawn, first, "spawn");

    const last = actorSteps.at(-1);
    if (!last || actor.endedAt === undefined) continue;
    const consumer = mainSteps.find((step) => step.timestamp >= actor.endedAt!);
    if (consumer) {
      addEdge(controlEdges, "result", last, consumer, "result returned");
      addEdge(dataEdges, "data", last, consumer, "Agent output consumed");
    }
  }
  return { controlEdges, dataEdges };
}

export function buildMultiAgentTrajectory(
  session: SerializedSession,
  persisted: ReadonlyMap<string, SerializedAgentProcess> =
    new Map<string, SerializedAgentProcess>(),
): MultiAgentTrajectory {
  const summaries = latestSummaries(session.agentMessages ?? []);
  const mainId = stableMainId(session, summaries);
  const mainActor: TrajectoryActor = {
    agentId: mainId,
    application: "main",
    role: "main",
    evidenceQuality: "full",
    createdAt: session.metadata.createdAt,
    startedAt: session.metadata.createdAt,
    endedAt: session.metadata.updatedAt,
  };
  const actors: TrajectoryActor[] = [mainActor];
  const pending: PendingStep[] = transcriptSteps(
    session.messages,
    mainActor,
    session.metadata.createdAt,
  );

  for (const summary of summaries) {
    const process = persisted.get(summary.agentId);
    const processMessages = process?.runtimeSnapshot?.messages;
    const full = Array.isArray(processMessages) && processMessages.length > 0;
    const quality: TrajectoryEvidenceQuality = full
      ? "full"
      : summaryHasEvidence(summary)
        ? "summary"
        : "missing";
    const actor: TrajectoryActor = {
      agentId: summary.agentId,
      parentAgentId: summary.parentAgentId ?? process?.parentAgentId ?? mainId,
      application: process?.application.name ?? summary.application,
      role: "subagent",
      applicationSource: sourceLabel(process),
      applicationDigest: process?.application.digest,
      evidenceQuality: quality,
      state: process?.state ?? summary.state,
      createdAt: process?.createdAt ?? summary.createdAt,
      startedAt: process?.startedAt ?? summary.startedAt,
      endedAt: process?.endedAt ?? summary.endedAt,
    };
    actors.push(actor);
    if (full) {
      pending.push(...transcriptSteps(
        processMessages,
        actor,
        actor.startedAt ?? actor.createdAt ?? session.metadata.createdAt,
      ));
      pending.push({
        agentId: actor.agentId,
        application: actor.application,
        role: "subagent",
        parentAgentId: actor.parentAgentId,
        kind: "exit",
        observation: "",
        thought: "",
        action: `exit:${actor.state ?? "completed"}`,
        result: process?.exit?.error ?? actor.state ?? "completed",
        timestamp: actor.endedAt ?? session.metadata.updatedAt,
        localOrder: pending.filter((step) => step.agentId === actor.agentId).length,
        isError: actor.state === "failed",
        evidenceQuality: "full",
      });
    } else if (quality === "summary") {
      pending.push({
        agentId: actor.agentId,
        application: actor.application,
        role: "subagent",
        parentAgentId: actor.parentAgentId,
        kind: "summary",
        observation: clip(summary.input.prompt, 4_000),
        thought: "",
        action: `run ${actor.application}`,
        result: clip(summary.output?.text ?? summary.output?.error ?? "", 8_000),
        sourceMessageIndex: summary.messageIndex,
        timestamp: summary.startedAt ?? summary.createdAt,
        localOrder: 0,
        isError: summary.state === "failed" || !!summary.output?.error,
        evidenceQuality: "summary",
      });
    }
  }

  const steps = pending
    .sort((a, b) =>
      a.timestamp - b.timestamp
      || a.agentId.localeCompare(b.agentId)
      || a.localOrder - b.localOrder,
    )
    .map((step, stepId) => ({ ...step, stepId }));
  const { controlEdges, dataEdges } = buildEdges(steps, actors);
  const subagents = actors.filter((actor) => actor.role === "subagent");
  const fullTranscripts = subagents.filter((actor) => actor.evidenceQuality === "full").length;
  const summaryTranscripts = subagents.filter((actor) => actor.evidenceQuality === "summary").length;
  const missingTranscripts = subagents.filter((actor) => actor.evidenceQuality === "missing").length;
  const affectedAgentIds = subagents
    .filter((actor) => actor.evidenceQuality !== "full")
    .map((actor) => actor.agentId);
  return {
    session,
    actors,
    steps,
    controlEdges,
    dataEdges,
    evidence: {
      totalActors: actors.length,
      subagentCount: subagents.length,
      fullTranscripts,
      summaryTranscripts,
      missingTranscripts,
      completeness: affectedAgentIds.length === 0 ? "complete" : "partial",
      affectedAgentIds,
    },
  };
}

export async function loadMultiAgentTrajectory(
  session: SerializedSession,
  processes: AgentProcessApplicationPort,
): Promise<MultiAgentTrajectory> {
  const ids = latestSummaries(session.agentMessages ?? []).map((message) => message.agentId);
  const found = await processes.loadPersisted(ids);
  return buildMultiAgentTrajectory(session, found);
}
