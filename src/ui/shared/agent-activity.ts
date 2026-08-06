import type { AgentProcess, AgentProcessState } from "../../agents/process/types.js";
import type { AgentSupervisor } from "../../agents/process/supervisor.js";
import type { HarnessEvent } from "../../core/events.js";
import type { AgentActivity, AgentActivityProgress } from "./types.js";

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
      parentAgentId: process.parentAgentId,
      parentSessionId: process.parentSessionId,
      application: process.application.name,
      attachment: process.attachment,
      state,
      input: this.inputs.get(process.agentId) ?? extractPrompt(process),
      output: exit?.output ?? this.outputs.get(process.agentId),
      error: exit?.error,
      progress: this.progress.get(process.agentId),
      createdAt: process.createdAt,
      startedAt: exit?.startedAt ?? process.startedAt,
      endedAt: exit?.endedAt ?? process.endedAt,
    };
  }
}
