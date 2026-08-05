import { createHash } from "node:crypto";
import { basename } from "node:path";
import { Value } from "typebox/value";

import { parseAgentMarkdown, stringList } from "./frontmatter.js";
import { AgentApplicationFrontmatterSchema } from "./schema.js";
import type {
  AgentApplication,
  AgentApplicationDraft,
  AgentFailureCode,
  AgentFallbackSpec,
  AgentApplicationSource,
  AgentApplicationSnapshot,
} from "./types.js";

const TOOL_ALIASES: Record<string, string> = {
  Read: "read_file",
  Write: "write_file",
  Edit: "edit",
  Glob: "glob",
  Grep: "grep",
  Bash: "bash",
  Agent: "spawn_agent",
  Task: "spawn_agent",
};

const KNOWN_FIELDS = new Set([
  "name",
  "description",
  "tools",
  "disallowedTools",
  "model",
  "effort",
  "permissionMode",
  "maxTurns",
  "skills",
  "initialPrompt",
  "memory",
  "background",
  "isolation",
  "color",
  "mcpServers",
  "hooks",
  "fallback",
]);

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function pickRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function pickFallback(value: unknown): AgentFallbackSpec[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("fallback must be an array");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("fallback entries must be objects");
    }
    const record = item as Record<string, unknown>;
    const handler = pickString(record.handler);
    if (!handler) throw new Error("fallback handler is required");
    const on = stringList(record.on) as AgentFailureCode[] | undefined;
    if (!on?.length) throw new Error(`fallback ${handler} must declare at least one event`);
    return { handler, on };
  });
}

function compileDraft(content: string, source: AgentApplicationSource): AgentApplicationDraft {
  const { attributes, body } = parseAgentMarkdown(content);
  const unsupported = Object.keys(attributes).filter((key) => !KNOWN_FIELDS.has(key));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported Agent Application field(s): ${unsupported.join(", ")}`);
  }
  const permissionMode = pickString(attributes.permissionMode);
  const memory = pickString(attributes.memory);
  const isolation = pickString(attributes.isolation);
  const draft: AgentApplicationDraft = {
    name: pickString(attributes.name),
    description: pickString(attributes.description),
    systemPrompt: body,
    tools: stringList(attributes.tools)?.map((tool) => TOOL_ALIASES[tool] ?? tool),
    disallowedTools: stringList(attributes.disallowedTools)?.map((tool) => TOOL_ALIASES[tool] ?? tool),
    model: pickString(attributes.model),
    effort: typeof attributes.effort === "number"
      ? attributes.effort
      : pickString(attributes.effort),
    permissionMode: permissionMode as AgentApplicationDraft["permissionMode"],
    maxTurns: typeof attributes.maxTurns === "number" ? attributes.maxTurns : undefined,
    skills: stringList(attributes.skills),
    initialPrompt: pickString(attributes.initialPrompt),
    memory: memory as AgentApplicationDraft["memory"],
    background: typeof attributes.background === "boolean" ? attributes.background : undefined,
    isolation: isolation as AgentApplicationDraft["isolation"],
    color: pickString(attributes.color),
    mcpServers: pickRecord(attributes.mcpServers),
    hooks: pickRecord(attributes.hooks),
    fallback: pickFallback(attributes.fallback),
  };
  const { systemPrompt: _systemPrompt, ...frontmatter } = draft;
  if (!Value.Check(AgentApplicationFrontmatterSchema, frontmatter)) {
    throw new Error("Agent Application frontmatter does not match its TypeBox schema");
  }
  validateDraft(draft, source);
  return draft;
}

function validateDraft(draft: AgentApplicationDraft, source: AgentApplicationSource): void {
  if (!draft.systemPrompt) throw new Error("Application body must contain a system prompt");
  if (draft.name && !/^[a-zA-Z0-9_-]+$/.test(draft.name)) {
    throw new Error(`Invalid application name: ${draft.name}`);
  }
  if (draft.permissionMode === "bypassPermissions" && source.kind !== "managed") {
    throw new Error("permissionMode=bypassPermissions is restricted to managed applications");
  }
  if (draft.permissionMode && !["default", "acceptEdits", "plan", "bypassPermissions"].includes(draft.permissionMode)) {
    throw new Error(`Invalid permissionMode: ${draft.permissionMode}`);
  }
  if (draft.memory && !["user", "project", "local"].includes(draft.memory)) {
    throw new Error(`Invalid memory scope: ${draft.memory}`);
  }
  if (draft.isolation && draft.isolation !== "worktree") {
    throw new Error(`Invalid isolation: ${draft.isolation}`);
  }
  if (draft.maxTurns !== undefined && (!Number.isInteger(draft.maxTurns) || draft.maxTurns < 1)) {
    throw new Error("maxTurns must be a positive integer");
  }
  if (draft.mcpServers && Object.keys(draft.mcpServers).length > 0) {
    throw new Error("Application-scoped mcpServers are not supported yet");
  }
  if (draft.hooks && Object.keys(draft.hooks).length > 0) {
    throw new Error("Application hooks are not supported yet");
  }
  const failureCodes = new Set(["model_unavailable", "model_error", "empty_output"]);
  for (const fallback of draft.fallback ?? []) {
    if (fallback.handler !== "ocr") {
      throw new Error(`Unknown fallback handler: ${fallback.handler}`);
    }
    const unknown = fallback.on.find((code) => !failureCodes.has(code));
    if (unknown) throw new Error(`Unknown fallback event: ${unknown}`);
  }
}

function digestApplication(application: Omit<AgentApplication, "digest" | "registryGeneration">): string {
  return createHash("sha256")
    .update(JSON.stringify(application))
    .digest("hex");
}

export function compileAgentApplication(
  content: string,
  source: AgentApplicationSource,
  generation: number,
  base?: AgentApplication,
): AgentApplicationSnapshot {
  const draft = compileDraft(content, source);

  const fallbackName = basename(source.path, ".md");
  const applicationWithoutVersion: Omit<AgentApplication, "digest" | "registryGeneration"> = {
    name: draft.name ?? base?.name ?? fallbackName,
    description: draft.description ?? base?.description ?? "",
    systemPrompt: draft.systemPrompt,
    tools: draft.tools ?? base?.tools,
    disallowedTools: draft.disallowedTools ?? base?.disallowedTools,
    model: draft.model ?? base?.model,
    effort: draft.effort ?? base?.effort,
    permissionMode: draft.permissionMode ?? base?.permissionMode ?? "default",
    maxTurns: draft.maxTurns ?? base?.maxTurns,
    skills: draft.skills ?? base?.skills,
    initialPrompt: draft.initialPrompt ?? base?.initialPrompt,
    memory: draft.memory ?? base?.memory,
    background: draft.background ?? base?.background,
    isolation: draft.isolation ?? base?.isolation,
    color: draft.color ?? base?.color,
    mcpServers: draft.mcpServers ?? base?.mcpServers,
    hooks: draft.hooks ?? base?.hooks,
    fallback: draft.fallback ?? base?.fallback,
    source,
  };
  const application: AgentApplication = {
    ...applicationWithoutVersion,
    digest: digestApplication(applicationWithoutVersion),
    registryGeneration: generation,
  };
  return Object.freeze({
    ...application,
    tools: application.tools ? Object.freeze([...application.tools]) as string[] : undefined,
    disallowedTools: application.disallowedTools
      ? Object.freeze([...application.disallowedTools]) as string[]
      : undefined,
    skills: application.skills ? Object.freeze([...application.skills]) as string[] : undefined,
    fallback: application.fallback
      ? Object.freeze(application.fallback.map((item) => Object.freeze({
          handler: item.handler,
          on: Object.freeze([...item.on]) as AgentFailureCode[],
        }))) as AgentFallbackSpec[]
      : undefined,
  });
}
