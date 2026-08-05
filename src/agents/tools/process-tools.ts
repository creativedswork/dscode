import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import type { AgentSupervisor } from "../process/supervisor.js";
import type { AgentExitResult, AgentProcess } from "../process/types.js";

export const AGENT_PROCESS_TOOL_NAMES = [
  "spawn_agent",
  "list_agents",
  "wait_agent",
  "get_agent_output",
  "terminate_agent",
  "kill_agent",
  "suspend_agent",
  "continue_agent",
  "background_agent",
  "send_agent_message",
] as const;

const spawnParams = Type.Object({
  application: Type.String({ description: "Configured Agent Application name" }),
  description: Type.String({ description: "Short reason for launching this process" }),
  input: Type.Object({
    prompt: Type.String({ description: "Task prompt passed as argv/stdin" }),
    attachments: Type.Optional(Type.Array(Type.Union([
      Type.Object({
        type: Type.Literal("image"),
        data: Type.Object({
          type: Type.Literal("image_ref"),
          hash: Type.String(),
          mimeType: Type.String(),
        }),
      }),
      Type.Object({ type: Type.Literal("file"), uri: Type.String() }),
      Type.Object({ type: Type.Literal("text"), text: Type.String() }),
    ]))),
  }),
  background: Type.Optional(Type.Boolean({ description: "Run as a background process" })),
  context_mode: Type.Optional(Type.Union([
    Type.Literal("minimal"),
    Type.Literal("selected"),
    Type.Literal("fork"),
  ])),
  selected_context: Type.Optional(Type.Object({
    items: Type.Array(Type.Union([
      Type.Object({ type: Type.Literal("message"), messageId: Type.String() }),
      Type.Object({ type: Type.Literal("tool_result"), toolCallId: Type.String() }),
      Type.Object({
        type: Type.Literal("file"),
        path: Type.String(),
        lineStart: Type.Optional(Type.Number()),
        lineEnd: Type.Optional(Type.Number()),
      }),
      Type.Object({
        type: Type.Literal("diff"),
        scope: Type.Union([
          Type.Literal("working-tree"),
          Type.Literal("staged"),
          Type.Literal("commit"),
        ]),
        ref: Type.Optional(Type.String()),
        paths: Type.Optional(Type.Array(Type.String())),
      }),
    ]), { minItems: 1 }),
    maxBytes: Type.Optional(Type.Number()),
    overflow: Type.Optional(Type.Union([
      Type.Literal("error"),
      Type.Literal("truncate-tail"),
    ])),
  })),
});

const agentIdParams = Type.Object({
  agentId: Type.String({ description: "Agent process ID" }),
});

const listParams = Type.Object({});

const waitParams = Type.Object({
  agentId: Type.String({ description: "Agent process ID" }),
  timeoutMs: Type.Optional(Type.Number({ description: "Maximum wait time in milliseconds" })),
});

const messageParams = Type.Object({
  agentId: Type.String({ description: "Agent process ID" }),
  message: Type.String({ description: "Message sent to the running Agent process" }),
});

function processSummary(agentProcess: AgentProcess): Record<string, unknown> {
  return {
    agentId: agentProcess.agentId,
    parentAgentId: agentProcess.parentAgentId,
    application: agentProcess.application.name,
    state: agentProcess.state,
    attachment: agentProcess.attachment,
    contextMode: agentProcess.contextMode,
    createdAt: agentProcess.createdAt,
    startedAt: agentProcess.startedAt,
    endedAt: agentProcess.endedAt,
  };
}

function exitText(result: AgentExitResult): string {
  if (result.output) return result.output;
  if (result.error) return `Agent ${result.agentId} ${result.state}: ${result.error}`;
  return `Agent ${result.agentId} ${result.state}`;
}

async function waitWithTimeout(
  wait: Promise<AgentExitResult>,
  timeoutMs?: number,
): Promise<AgentExitResult> {
  if (!timeoutMs) return wait;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      wait,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Agent wait timed out")), timeoutMs);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function requireVisible(
  supervisor: AgentSupervisor,
  currentAgentId: string,
  targetAgentId: string,
): AgentProcess {
  const current = supervisor.require(currentAgentId);
  const target = supervisor.require(targetAgentId);
  let ancestorId = target.parentAgentId;
  let visible = false;
  while (ancestorId) {
    if (ancestorId === currentAgentId) {
      visible = true;
      break;
    }
    ancestorId = supervisor.get(ancestorId)?.parentAgentId;
  }
  if (!visible || target.parentSessionId !== current.parentSessionId) {
    throw new Error(`Agent process ${targetAgentId} is not visible to ${currentAgentId}`);
  }
  return target;
}

export function makeAgentProcessTools(
  supervisor: AgentSupervisor,
  currentAgentId: string,
): AgentTool<any>[] {
  const spawnAgent: AgentTool<typeof spawnParams> = {
    name: "spawn_agent",
    label: "Spawn Agent",
    description: "Launch a configured Agent Application as a child process.",
    parameters: spawnParams,
    execute: async (_id, params, signal) => {
      if (params.context_mode === "fork") {
        throw new Error("context_mode=fork is disabled until its evaluation gate passes");
      }
      if (params.context_mode === "selected" && !params.selected_context) {
        throw new Error("context_mode=selected requires selected_context");
      }
      if (params.context_mode !== "selected" && params.selected_context) {
        throw new Error("selected_context requires context_mode=selected");
      }
      const spawned = await supervisor.spawn({
        application: params.application,
        parentAgentId: currentAgentId,
        input: params.input,
        attachment: params.background ? "background" : "foreground",
        contextMode: params.context_mode ?? "minimal",
        contextSelection: params.selected_context,
        signal,
      });
      const text = spawned.result
        ? exitText(spawned.result)
        : `Started background Agent ${spawned.agentId}`;
      return { content: [{ type: "text", text }], details: spawned };
    },
  };

  const listAgents: AgentTool<typeof listParams> = {
    name: "list_agents",
    label: "List Agents",
    description: "List child Agent processes and their lifecycle state.",
    parameters: listParams,
    execute: async () => {
      const processes = supervisor.list(currentAgentId).map(processSummary);
      return {
        content: [{ type: "text", text: JSON.stringify(processes, null, 2) }],
        details: { processes },
      };
    },
  };

  const waitAgent: AgentTool<typeof waitParams> = {
    name: "wait_agent",
    label: "Wait for Agent",
    description: "Wait for a child Agent process to exit.",
    parameters: waitParams,
    execute: async (_id, params) => {
      requireVisible(supervisor, currentAgentId, params.agentId);
      const wait = supervisor.wait(params.agentId);
      const result = await waitWithTimeout(wait, params.timeoutMs);
      return { content: [{ type: "text", text: exitText(result) }], details: result };
    },
  };

  const getOutput: AgentTool<typeof agentIdParams> = {
    name: "get_agent_output",
    label: "Get Agent Output",
    description: "Read current state and final output of an Agent process.",
    parameters: agentIdParams,
    execute: async (_id, { agentId }) => {
      const agentProcess = requireVisible(supervisor, currentAgentId, agentId);
      const text = agentProcess.exit
        ? exitText(agentProcess.exit)
        : `Agent ${agentId} is ${agentProcess.state}`;
      return {
        content: [{ type: "text", text }],
        details: { process: processSummary(agentProcess), exit: agentProcess.exit },
      };
    },
  };

  const terminateAgent = lifecycleTool(
    "terminate_agent",
    "Terminate Agent",
    "Request graceful termination of an Agent process.",
    currentAgentId,
    supervisor,
    (agentId) => supervisor.terminate(agentId),
  );
  const killAgent = lifecycleTool(
    "kill_agent",
    "Kill Agent",
    "Immediately abort an Agent process.",
    currentAgentId,
    supervisor,
    (agentId) => supervisor.kill(agentId),
  );

  const suspendAgent: AgentTool<typeof agentIdParams> = {
    name: "suspend_agent",
    label: "Suspend Agent",
    description: "Suspend an Agent process when its Runtime supports it.",
    parameters: agentIdParams,
    execute: async (_id, { agentId }) => {
      requireVisible(supervisor, currentAgentId, agentId);
      await supervisor.suspend(agentId);
      return { content: [{ type: "text", text: `Suspended ${agentId}` }], details: { agentId } };
    },
  };
  const continueAgent: AgentTool<typeof agentIdParams> = {
    name: "continue_agent",
    label: "Continue Agent",
    description: "Continue a suspended Agent process.",
    parameters: agentIdParams,
    execute: async (_id, { agentId }) => {
      requireVisible(supervisor, currentAgentId, agentId);
      await supervisor.continue(agentId);
      return { content: [{ type: "text", text: `Continued ${agentId}` }], details: { agentId } };
    },
  };
  const sendMessage: AgentTool<typeof messageParams> = {
    name: "send_agent_message",
    label: "Send Agent Message",
    description: "Send a steering message to a running Agent process.",
    parameters: messageParams,
    execute: async (_id, { agentId, message }) => {
      requireVisible(supervisor, currentAgentId, agentId);
      supervisor.sendMessage(agentId, message);
      return { content: [{ type: "text", text: `Message sent to ${agentId}` }], details: { agentId } };
    },
  };
  const backgroundAgent: AgentTool<typeof agentIdParams> = {
    name: "background_agent",
    label: "Background Agent",
    description: "Detach a foreground Agent without restarting its Runtime.",
    parameters: agentIdParams,
    execute: async (_id, { agentId }) => {
      requireVisible(supervisor, currentAgentId, agentId);
      await supervisor.background(agentId);
      return { content: [{ type: "text", text: `Detached ${agentId}` }], details: { agentId } };
    },
  };

  return [
    spawnAgent,
    listAgents,
    waitAgent,
    getOutput,
    terminateAgent,
    killAgent,
    suspendAgent,
    continueAgent,
    backgroundAgent,
    sendMessage,
  ];
}

function lifecycleTool(
  name: string,
  label: string,
  description: string,
  currentAgentId: string,
  supervisor: AgentSupervisor,
  action: (agentId: string) => Promise<AgentExitResult>,
): AgentTool<typeof agentIdParams> {
  return {
    name,
    label,
    description,
    parameters: agentIdParams,
    execute: async (_id, { agentId }) => {
      requireVisible(supervisor, currentAgentId, agentId);
      const result = await action(agentId);
      return { content: [{ type: "text", text: exitText(result) }], details: result };
    },
  };
}
