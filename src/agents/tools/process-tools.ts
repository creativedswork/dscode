import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

import { ImageCache } from "../../drivers/vision/cache.js";
import { readImageFile } from "../../drivers/vision/reader.js";
import { isImagePath } from "../../project-files/resolver.js";
import type { AgentSupervisor } from "../process/supervisor.js";
import type {
  AgentExitResult,
  AgentInputAttachment,
  AgentProcess,
} from "../process/types.js";

export const AGENT_PROCESS_TOOL_NAMES = [
  "spawn_agent",
  "list_agents",
  "terminate_agent",
  "kill_agent",
  "suspend_agent",
  "continue_agent",
  "background_agent",
  "send_agent_message",
] as const;

const spawnParams = Type.Object({
  application: Type.String({ description: "Configured Agent Application name" }),
  description: Type.String({
    description: "User-visible role and purpose in '<Role>: <purpose>' form, for example 'Researcher: verify paper claims'",
  }),
  input: Type.Object({
    prompt: Type.String({ description: "Task prompt passed as argv/stdin" }),
    attachments: Type.Optional(Type.Array(Type.Union([
      Type.Object({
        type: Type.Literal("image"),
        data: Type.Object({
          type: Type.Literal("image_ref"),
          hash: Type.String({
            description: "Existing ImageCache filename; never pass a local path or file:// URI",
          }),
          mimeType: Type.String(),
        }),
      }),
      Type.Object({
        type: Type.Literal("file"),
        uri: Type.String({
          description: "Project-local path or file:// URI; image files are cached before launch",
        }),
      }),
      Type.Object({ type: Type.Literal("text"), text: Type.String() }),
    ]))),
  }),
  background: Type.Optional(Type.Boolean({
    description: [
      "Optional scheduling override for this delegation.",
      "Omit to honor the Application's user-configured default (foreground when unset).",
      "Set false when the result is needed before continuing; set true only for independent work.",
      "Background completion is delivered automatically without polling.",
    ].join(" "),
  })),
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

const messageParams = Type.Object({
  agentId: Type.String({ description: "Agent process ID" }),
  message: Type.String({ description: "Message sent to the running Agent process" }),
});

function processSummary(agentProcess: AgentProcess): Record<string, unknown> {
  return {
    agentId: agentProcess.agentId,
    parentAgentId: agentProcess.parentAgentId,
    description: agentProcess.description,
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

function spawnAgentDescription(supervisor: AgentSupervisor): string {
  const applications = supervisor.listApplications();
  const catalog = applications.map((application) => {
    const description = application.description.replace(/\s+/g, " ").trim()
      || "No description provided";
    return `- ${application.name}: ${description}`;
  });
  return [
    "Launch a configured Agent Application as a fresh child process.",
    "Select a matching specialized Application when available; otherwise use general.",
    "Honor the Application's scheduling default unless this delegation needs an explicit override.",
    "When choosing dynamically, use foreground if later work depends on the result and background only if the parent can continue independently.",
    "Background completion is delivered automatically; do not poll for output or completion.",
    "Available Applications:",
    ...catalog,
  ].join("\n");
}

const MAX_SPAWN_IMAGE_BYTES = 20 * 1024 * 1024;

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function resolveProjectFile(uri: string, cwd: string): Promise<string> {
  const value = uri.startsWith("file:") ? fileURLToPath(uri) : uri;
  const candidate = resolve(cwd, value);
  const [root, file] = await Promise.all([realpath(cwd), realpath(candidate)]);
  if (!isWithin(root, file)) {
    throw new Error(`Attachment path ${uri} is outside Agent cwd ${cwd}`);
  }
  const info = await stat(file);
  if (!info.isFile()) throw new Error(`Attachment is not a file: ${uri}`);
  if (info.size > MAX_SPAWN_IMAGE_BYTES) {
    throw new Error(`Image attachment exceeds ${MAX_SPAWN_IMAGE_BYTES} bytes: ${uri}`);
  }
  return file;
}

async function resolveSpawnAttachments(
  attachments: AgentInputAttachment[] | undefined,
  cwd: string,
): Promise<AgentInputAttachment[] | undefined> {
  if (!attachments) return undefined;
  return Promise.all(attachments.map(async (attachment) => {
    if (attachment.type === "image" && attachment.data.type === "image_ref") {
      if (basename(attachment.data.hash) !== attachment.data.hash) {
        throw new Error(
          "image_ref.hash must be an existing ImageCache filename; use a file attachment for local images",
        );
      }
      if (!await ImageCache.get(attachment.data)) {
        throw new Error(`Unknown cached image reference: ${attachment.data.hash}`);
      }
      return attachment;
    }
    if (attachment.type !== "file" || !isImagePath(attachment.uri)) return attachment;
    const path = await resolveProjectFile(attachment.uri, cwd);
    const image = await readImageFile(path);
    const data = await ImageCache.put(image);
    return { type: "image" as const, data };
  }));
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
    get description() {
      return spawnAgentDescription(supervisor);
    },
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
      const current = supervisor.require(currentAgentId);
      const attachments = await resolveSpawnAttachments(
        params.input.attachments,
        current.context.cwd,
      );
      const spawned = await supervisor.spawn({
        application: params.application,
        parentAgentId: currentAgentId,
        description: params.description,
        input: {
          prompt: params.input.prompt,
          attachments,
        },
        attachment: params.background === undefined
          ? undefined
          : params.background ? "background" : "foreground",
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
