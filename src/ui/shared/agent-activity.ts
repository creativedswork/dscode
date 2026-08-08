import type { AgentProcess, AgentProcessState } from "../../agents/process/types.js";
import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { HarnessEvent } from "../../core/events.js";
import type {
  AgentActivity,
  AgentActivityProgress,
  AgentPermissionActivity,
  AgentToolActivity,
  ToolResultProjection,
} from "./types.js";
import { formatSubagentLabel } from "./agent-label.js";

export type AgentLifecycleEvent = Extract<
  HarnessEvent,
  { type: "agent:spawned" | "agent:state" | "agent:progress" | "agent:output" | "agent:exit" }
>;

const TERMINAL_STATES = new Set<AgentProcessState>([
  "completed",
  "failed",
  "terminated",
  "killed",
]);

interface ToolProgressDetails {
  kind: "tool";
  status: "running" | "completed" | "failed";
  toolCallId: string;
  toolName: string;
  args?: string;
  summary?: string;
  resultDetail?: ToolResultProjection;
  startedAt: number;
  endedAt?: number;
  isError?: boolean;
}

interface PermissionProgressDetails {
  kind: "permission";
  status: "waiting" | "resolved";
  toolCallId?: string;
  toolName: string;
  preview?: string;
}

function progressDetails(value: unknown): ToolProgressDetails | PermissionProgressDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const details = value as Record<string, unknown>;
  if (
    details.kind === "tool"
    && typeof details.toolCallId === "string"
    && typeof details.toolName === "string"
    && (details.status === "running"
      || details.status === "completed"
      || details.status === "failed")
  ) {
    return details as unknown as ToolProgressDetails;
  }
  if (
    details.kind === "permission"
    && typeof details.toolName === "string"
    && (details.status === "waiting" || details.status === "resolved")
  ) {
    return details as unknown as PermissionProgressDetails;
  }
  return undefined;
}

function extractPrompt(process: AgentProcess): string {
  const messages = process.runtimeSnapshot?.messages;
  if (!Array.isArray(messages)) return "";
  const userMessage = messages.find((message: any) => message?.role === "user") as any;
  const content = userMessage?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block: any) => block?.type === "text")
    .map((block: any) => String(block.text ?? ""))
    .join("\n");
}

export class AgentActivityProjector {
  private readonly inputs = new Map<string, string>();
  private readonly progress = new Map<string, AgentActivityProgress>();
  private readonly tools = new Map<string, Map<string, AgentToolActivity>>();
  private readonly permissions = new Map<string, AgentPermissionActivity>();
  private readonly outputs = new Map<string, string>();
  private readonly fingerprints = new Map<string, string>();

  constructor(
    private readonly supervisor: AgentSupervisor,
    private readonly visibleSessionId: () => string | undefined,
    private readonly publish: (activity: AgentActivity) => void,
  ) {}

  handle(event: AgentLifecycleEvent): AgentActivity | undefined {
    const agentId = event.type === "agent:exit" ? event.result.agentId : event.agentId;
    const process = this.supervisor.get(agentId);
    if (!process || process.role !== "subagent") return undefined;
    // Process-only workers belong to isolated workflows such as Eval. Their
    // progress is projected by the owning workflow, not the Chat conversation.
    if (process.recording === "process-only") return undefined;
    if (process.parentSessionId !== this.visibleSessionId()) return undefined;

    if (event.type === "agent:spawned") {
      this.inputs.set(agentId, event.input);
    } else if (event.type === "agent:progress") {
      const details = progressDetails(event.details);
      if (details?.kind === "tool") {
        this.upsertTool(agentId, details);
      } else if (details?.kind === "permission") {
        this.updatePermission(agentId, details);
      }
      this.progress.set(agentId, {
        phase: event.phase,
        current: event.progress,
        total: event.total,
        message: event.message,
      });
    } else if (event.type === "agent:output") {
      this.outputs.set(agentId, event.text);
    }

    const activity = this.snapshot(process, event);
    const terminal = TERMINAL_STATES.has(activity.state);
    const fingerprint = JSON.stringify(activity);
    if (!terminal && this.fingerprints.get(agentId) === fingerprint) return undefined;
    this.fingerprints.set(agentId, fingerprint);
    this.publish(activity);
    return activity;
  }

  private snapshot(process: AgentProcess, event: AgentLifecycleEvent): AgentActivity {
    const exit = event.type === "agent:exit" ? event.result : process.exit;
    const state = event.type === "agent:spawned" && process.state === "created"
      ? "running"
      : process.state;
    return {
      agentId: process.agentId,
      executionId: process.agentId,
      parentAgentId: process.parentAgentId,
      parentSessionId: process.parentSessionId,
      label: formatSubagentLabel(
        process.description,
        process.application.name,
      ),
      application: process.application.name,
      attachment: process.attachment,
      state,
      input: this.inputs.get(process.agentId) ?? extractPrompt(process),
      output: exit?.output ?? this.outputs.get(process.agentId),
      error: exit?.error,
      progress: this.progress.get(process.agentId),
      tools: this.toolSnapshot(process.agentId),
      permission: this.permissions.get(process.agentId),
      createdAt: process.createdAt,
      startedAt: exit?.startedAt ?? process.startedAt,
      endedAt: exit?.endedAt ?? process.endedAt,
    };
  }

  private upsertTool(agentId: string, details: ToolProgressDetails): void {
    const tools = this.tools.get(agentId) ?? new Map<string, AgentToolActivity>();
    const previous = tools.get(details.toolCallId);
    tools.set(details.toolCallId, {
      toolCallId: details.toolCallId,
      name: details.toolName,
      status: details.status,
      args: details.args ?? previous?.args,
      summary: details.summary ?? details.args ?? previous?.summary,
      resultDetail: details.resultDetail ?? previous?.resultDetail,
      startedAt: details.startedAt ?? previous?.startedAt ?? Date.now(),
      endedAt: details.endedAt ?? previous?.endedAt,
      isError: details.isError ?? previous?.isError,
    });
    this.tools.set(agentId, tools);
  }

  private updatePermission(agentId: string, details: PermissionProgressDetails): void {
    const tools = this.tools.get(agentId);
    const matchingToolCallId = details.toolCallId
      ?? [...(tools?.values() ?? [])]
        .reverse()
        .find((tool) => tool.name === details.toolName && tool.status === "running")
        ?.toolCallId;
    if (details.status === "resolved") {
      this.permissions.delete(agentId);
      if (matchingToolCallId && tools) {
        const tool = tools.get(matchingToolCallId);
        if (tool?.status === "permission") {
          tools.set(matchingToolCallId, { ...tool, status: "running" });
        }
      }
      return;
    }
    this.permissions.set(agentId, {
      toolName: details.toolName,
      preview: details.preview ?? "",
      toolCallId: matchingToolCallId,
    });
    if (matchingToolCallId && tools) {
      const tool = tools.get(matchingToolCallId);
      if (tool) tools.set(matchingToolCallId, { ...tool, status: "permission" });
    }
  }

  private toolSnapshot(agentId: string): AgentToolActivity[] | undefined {
    const tools = this.tools.get(agentId);
    if (!tools || tools.size === 0) return undefined;
    return [...tools.values()].sort((left, right) =>
      left.startedAt - right.startedAt
      || left.toolCallId.localeCompare(right.toolCallId),
    );
  }
}
