import { resolve } from "node:path";
import type { Agent } from "@mariozechner/pi-agent-core";
import type { SlashCommand as AutocompleteSlashCommand } from "@earendil-works/pi-tui";

import type { HarnessConfig } from "../core/types.js";
import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { ToolRegistry } from "../drivers/tool-registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import type { MCPManager } from "../mcp/manager.js";
import type { TuiApp } from "./tui-app.js";
import { saveUserConfig, saveUserProjectCwd, maskApiKey, PROVIDER_ENV_VARS } from "../core/config.js";
import { getAllProviders, getAllModels, getVisionModels, getVisionProviders } from "../models/index.js";
import { readImageFile, readClipboardImage } from "../utils/image.js";


interface CommandContext {
  agent: Agent;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  toolRegistry: ToolRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  mcpManager?: MCPManager;
  config: HarnessConfig;
  onSetModel: (modelId: string) => void;
  onSetThinking: (level: string) => void;
  onSetProvider: (providerId: string) => void;
  tui: TuiApp;
}

interface SlashCommandDef {
  name: string;
  description: string;
  execute(args: string, ctx: CommandContext): void | Promise<void>;
}

const COMMANDS: SlashCommandDef[] = [
  {
    name: "help",
    description: "Show available commands",
    execute: async (_args, ctx) => {
      const lines: string[] = [];
      for (const cmd of COMMANDS) {
        lines.push(`  /${cmd.name}  ${cmd.description}`);
      }
      ctx.tui.addInfo("Available commands:\n" + lines.join("\n"));
    },
  },
  {
    name: "reset",
    description: "Clear conversation history",
    execute: async (_args, ctx) => {
      ctx.agent.reset();
      ctx.tui.clearConversationView();
    },
  },
  {
    name: "session",
    description: "Session management (list|save|load|delete)",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      switch (sub) {
        case "list": {
          const all = rest[0] === "--all";
          const sessions = all
            ? ctx.sessionManager.listAllSessions()
            : ctx.sessionManager.listSessions();
          if (sessions.length === 0) {
            const msg = all
              ? "No saved sessions."
              : "No sessions in this project. Start a conversation to create one.";
            ctx.tui.addInfo(msg);
            return;
          }
          const currentId = ctx.sessionManager.getCurrentSessionId();
          const header = all
            ? "All sessions:"
            : `Sessions (project: ${ctx.config.projectPath}):`;
          const lines = sessions.slice(0, 30).map((s) => {
            const date = new Date(s.updatedAt).toISOString().slice(0, 10);
            const time = new Date(s.updatedAt).toISOString().slice(11, 16);
            const marker = s.id === currentId ? "*" : " ";
            const title = `"${s.title.slice(0, 60)}"`;
            return `${marker} ${s.id.slice(0, 8)} ${title}  ${s.modelProvider}/${s.modelId}  ${date} ${time}  ${s.messageCount} msgs`;
          });
          ctx.tui.addInfo(header + "\n" + lines.join("\n"));
          break;
        }
        case "save":
          try {
            ctx.sessionManager.saveSession(ctx.agent);
            ctx.tui.addInfo("Session saved.");
          } catch (err: any) {
            ctx.tui.addError(`Failed to save session: ${err.message}`);
          }
          break;
        case "load": {
          const id = rest[0];
          if (!id) { ctx.tui.addError("Usage: /session load <id>"); return; }
          const sessions = ctx.sessionManager.listSessions();
          const matches = sessions.filter((s) => s.id.startsWith(id));
          if (matches.length === 0) {
            ctx.tui.addError(`Session not found: ${id}`);
            return;
          }
          if (matches.length > 1) {
            const matchLines = matches.map((s) =>
              `  ${s.id.slice(0, 8)} "${s.title.slice(0, 60)}"  ${s.modelProvider}/${s.modelId}  ${s.messageCount} msgs`,
            );
            ctx.tui.addError(
              `Ambiguous session ID prefix. Matching sessions:\n${matchLines.join("\n")}`,
            );
            return;
          }
          const match = matches[0];
          const result = ctx.sessionManager.loadSession(match.id, ctx.agent);
          if (!result.success) {
            ctx.tui.addError(`Failed to load session: ${result.error}`);
            return;
          }
          const lines = [
            `Loaded session: ${match.id.slice(0, 8)}`,
            `  Title:    "${match.title}"`,
            `  Model:    ${match.modelProvider} / ${match.modelId}`,
            `  Project:  ${match.projectPath || "(unscoped)"}`,
            `  Created:  ${new Date(match.createdAt).toISOString().replace("T", " ").slice(0, 16)}`,
            `  Activity: ${new Date(match.updatedAt).toISOString().replace("T", " ").slice(0, 16)}`,
            `  Messages: ${match.messageCount}`,
          ];
          ctx.tui.addInfo(lines.join("\n"));
          ctx.tui.clearConversationView();
          ctx.tui.replayMessages(ctx.agent.state.messages as unknown[]);
          break;
        }
        case "delete": {
          const id = rest[0];
          if (!id) { ctx.tui.addError("Usage: /session delete <id>"); return; }
          const result = ctx.sessionManager.deleteSession(id);
          if (!result.success) {
            ctx.tui.addError(`Failed to delete session: ${result.error}`);
            return;
          }
          ctx.tui.addInfo("Session deleted.");
          break;
        }
        default:
          ctx.tui.addError("Usage: /session [list|save|load|delete]");
      }
    },
  },
  {
    name: "memory",
    description: "Memory management (list|add|remove|clear)",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      const sessionId = ctx.sessionManager.getCurrentSessionId() ?? "unknown";
      switch (sub) {
        case "list": {
          const scope = rest[0] as "global" | "project" | undefined;
          const entries = ctx.memoryManager.listMemories(scope);
          if (entries.length === 0) {
            ctx.tui.addInfo("No memories stored.");
            return;
          }
          const lines = entries.map((m) => `  [${m.scope}] ${m.content} (${m.id})`);
          ctx.tui.addInfo("Memories:\n" + lines.join("\n"));
          break;
        }
        case "add": {
          const content = rest.join(" ");
          if (!content) { ctx.tui.addError("Usage: /memory add <content>"); return; }
          ctx.memoryManager.addMemory(content, "project", sessionId);
          ctx.tui.addInfo("Memory added.");
          break;
        }
        case "remove": {
          const id = rest[0];
          if (!id) { ctx.tui.addError("Usage: /memory remove <id>"); return; }
          ctx.memoryManager.removeMemory(id);
          ctx.tui.addInfo("Memory removed.");
          break;
        }
        case "clear": {
          const scope = rest[0] as "global" | "project" | undefined;
          ctx.memoryManager.clearMemories(scope);
          ctx.tui.addInfo("Memories cleared.");
          break;
        }
        default:
          ctx.tui.addError("Usage: /memory [list|add|remove|clear]");
      }
    },
  },
  {
    name: "skills",
    description: "Skill management (list|activate|deactivate)",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      switch (sub) {
        case "activate": {
          const name = rest[0];
          if (!name) { ctx.tui.addError("Usage: /skills activate <name>"); return; }
          try {
            const skill = ctx.skillManager.activate(name, ctx.driverRegistry);
            ctx.agent.state.tools = ctx.toolRegistry.buildToolsForRequest();
            const toolNames = skill.tools.map((t) => t.name).join(", ");
            ctx.tui.addInfo(`Activated: ${name} (allowed tools: ${toolNames || "none"})`);
          } catch (err: any) {
            ctx.tui.addError(err.message);
          }
          break;
        }
        case "deactivate": {
          const name = rest[0];
          if (!name) { ctx.tui.addError("Usage: /skills deactivate <name>"); return; }
          ctx.skillManager.deactivate(name);
          ctx.agent.state.tools = ctx.toolRegistry.buildToolsForRequest();
          ctx.tui.addInfo(`Deactivated: ${name}`);
          break;
        }
        default: {
          const lines: string[] = [];
          for (const { skill, active } of ctx.skillManager.listAll()) {
            const status = active ? "active" : "inactive";
            lines.push(`  ${skill.name} [${status}] (${skill.source}) — ${skill.description}`);
          }
          ctx.tui.addInfo("Skills:\n" + lines.join("\n"));
        }
      }
    },
  },
  {
    name: "drivers",
    description: "List loaded drivers",
    execute: async (_args, ctx) => {
      const lines: string[] = [];
      for (const d of ctx.driverRegistry.listAll()) {
        const toolNames = d.tools.map((t) => t.name).join(", ");
        lines.push(`  ${d.name} (${d.source}) — ${d.description}`);
        lines.push(`    tools: ${toolNames}`);
      }
      ctx.tui.addInfo("Drivers:\n" + lines.join("\n"));
    },
  },
  {
    name: "mcp",
    description: "Browse MCP servers and tools",
    execute: async (_args, ctx) => {
      if (!ctx.mcpManager || ctx.mcpManager.getStates().length === 0) {
        ctx.tui.addInfo("No MCP servers configured.");
        return;
      }
      ctx.tui.openMcpBrowser();
    },
  },
  {
    name: "permissions",
    description: "Show session permission grants",
    execute: async (_args, ctx) => {
      const grants = ctx.permissionManager.getSessionGrants();
      if (grants.length === 0) {
        ctx.tui.addInfo("No session-level grants.");
        return;
      }
      const lines = grants.map((g) => `  ✓ ${g}`);
      ctx.tui.addInfo("Session grants:\n" + lines.join("\n"));
    },
  },
  {
    name: "cost",
    description: "Show token usage for this session",
    execute: async (_args, ctx) => {
      const msgs = ctx.agent.state.messages;
      const tokens = ctx.contextManager.getEstimatedTokens(msgs);
      ctx.tui.addInfo(`Estimated context: ~${tokens} tokens (${msgs.length} messages)`);
    },
  },
  {
    name: "compact",
    description: "Force context compaction",
    execute: async (_args, ctx) => {
      const before = ctx.agent.state.messages.length;
      const compacted = await ctx.contextManager.transform(ctx.agent.state.messages);
      ctx.agent.state.messages = compacted as any;
      const after = ctx.agent.state.messages.length;
      ctx.tui.addInfo(`Compacted: ${before} → ${after} messages`);
    },
  },
  {
    name: "config",
    description: "Show or change user command config",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      switch (sub) {
        case "help": {
          ctx.tui.addInfo([
            "/config                  Show current user command config",
            "/config provider <id>     Switch provider (no restart needed)",
            "/config model <id>       Switch model (saved to ~/.dscode/config.json)",
            "/config thinking <level> Set thinking level (saved to ~/.dscode/config.json)",
            "/config key <api-key>    Set your API key",
            "/config vision-provider <id>  Set vision model provider",
            "/config vision-model <id>    Set vision model",
            "/config vision-key <key>     Set vision model API key",
            "/config cwd <path>       Set working directory for this project (saved to ~/.dscode/config.json)",
            "/config help             Show this help",
            "",
            "Settings via ~/.dscode/settings.json or .dscode/settings.json:",
            "  atFileMaxFiles: number     Max files per @file message (default: 5)",
            "  atFileMaxFileSize: number   Max bytes per @file (default: 51200)",
            "  atFileMaxTotalSize: number  Max total bytes per message (default: 204800)",
          ].join("\n"));
          break;
        }
        case "provider": {
          const providerId = rest[0];
          if (!providerId) {
            const available = getAllProviders();
            const current = ctx.config.provider;
            const lines = available.map((p) => p === current ? `  * ${p} (current)` : `  ${p}`);
            ctx.tui.addInfo(`Available providers:\n${lines.join("\n")}\n\nUsage: /config provider <provider-id>`);
            return;
          }
          try {
            ctx.onSetProvider(providerId);
            ctx.tui.addInfo(`Provider switched to: ${providerId}. Default model selected. Conversation reset.`);
          } catch (err: any) {
            ctx.tui.addError(err.message);
          }
          break;
        }

        case "model": {
          const modelId = rest[0];
          if (!modelId) {
            const available = getAllModels(ctx.config.provider);
            const models = available.map((m) => `  ${m.id} — ${m.name}`);
            ctx.tui.addInfo(`Models for ${ctx.config.provider}:\n${models.join("\n")}\n\nUsage: /config model <model-id>`);
            return;
          }
          ctx.onSetModel(modelId);
          ctx.tui.addInfo(`Model switched to: ${modelId}`);
          break;
        }
        case "cwd": {
          const cwd = rest.join(" ");
          if (!cwd) {
            ctx.tui.addError("Usage: /config cwd <path>");
            return;
          }
          const resolvedCwd = resolve(cwd);
          saveUserProjectCwd(ctx.config.startupPath, resolvedCwd);
          ctx.tui.addInfo(`CWD set to: ${resolvedCwd} (saved to ~/.dscode/config.json for this project, restart required)`);
          break;
        }
        case "key": {
          const key = rest.join(" ");
          if (!key) {
            ctx.tui.addError("Usage: /config key <api-key>");
            return;
          }
          saveUserConfig({ apiKey: key });
          ctx.config.apiKey = key;
          const envVar = PROVIDER_ENV_VARS[ctx.config.provider] ?? "DEEPSEEK_API_KEY";
          process.env[envVar] = key;
          if (envVar !== "DEEPSEEK_API_KEY") {
            process.env.DEEPSEEK_API_KEY = key;
          }
          ctx.tui.addInfo(`API key saved to ~/.dscode/config.json: ${maskApiKey(key)}`);
          break;
        }
        case "thinking": {
          const level = rest[0];
          const valid = ["off", "minimal", "low", "medium", "high", "xhigh"];
          if (!level || !valid.includes(level)) {
            ctx.tui.addError(`Usage: /config thinking <${valid.join("|")}>`);
            return;
          }
          ctx.onSetThinking(level);
          ctx.tui.addInfo(`Thinking level set to: ${level}`);
          break;
        }
        case "vision-provider": {
          const vpId = rest[0];
          if (!vpId) {
            const available = getVisionProviders();
            const current = (ctx.config.vision as any)?.provider;
            const lines = available.map((p) => p === current ? `  * ${p} (current)` : `  ${p}`);
            ctx.tui.addInfo(`Available providers for vision model:\n${lines.join("\n")}\n\nUsage: /config vision-provider <provider-id>`);
            return;
          }
          try {
            const v = { provider: vpId } as any;
            saveUserConfig({ vision: v });
            ctx.config.vision = v;
            ctx.tui.addInfo(`Vision provider set to: ${vpId}`);
          } catch (err: any) {
            ctx.tui.addError(err.message);
          }
          break;
        }
        case "vision-model": {
          const vmId = rest[0];
          if (!vmId) {
            const vp = (ctx.config.vision as any)?.provider;
            if (!vp) {
              ctx.tui.addError("No vision provider configured. Set it first: /config vision-provider <id>");
              return;
            }
            const available = getVisionModels(vp);
            const models = available.map((m) => `  ${m.id} — ${m.name}`);
            ctx.tui.addInfo(`Models for vision provider ${vp}:\n${models.join("\n")}\n\nUsage: /config vision-model <model-id>`);
            return;
          }
          const vp = (ctx.config.vision as any)?.provider;
          if (!vp) {
            ctx.tui.addError("No vision provider configured. Set it first: /config vision-provider <id>");
            return;
          }
          try {
            const existingKey = (ctx.config.vision as any)?.key;
            const v = { provider: vp, model: vmId, key: existingKey };
            saveUserConfig({ vision: v });
            ctx.config.vision = v;
            ctx.tui.addInfo(`Vision model set to: ${vmId}`);
          } catch (err: any) {
            ctx.tui.addError(err.message);
          }
          break;
        }
        case "vision-key": {
          const key = rest.join(" ");
          if (!key) {
            ctx.tui.addError("Usage: /config vision-key <api-key>");
            return;
          }
          const vp = (ctx.config.vision as any)?.provider ?? "";
          const vm = (ctx.config.vision as any)?.model ?? "";
          const v = { provider: vp, model: vm, key };
          saveUserConfig({ vision: v });
          ctx.config.vision = v;
          ctx.tui.addInfo(`Vision API key saved to ~/.dscode/config.json: ${maskApiKey(key)}`);
          break;
        }
        default: {
          const lines = [
            `  provider      ${ctx.config.provider}`,
            `  model         ${ctx.config.modelId}`,
            `  key           ${maskApiKey(ctx.config.apiKey)}`,
            `  cwd           ${ctx.config.projectPath}`,
            `  maxTokens     ${ctx.config.maxTokens}`,
            `  thinking      ${ctx.config.thinkingLevel}`,
            `  vision-provider  ${(ctx.config.vision as any)?.provider ?? "(not set)"}`,
            `  vision-model     ${(ctx.config.vision as any)?.model ?? "(not set)"}`,
            `  vision-key       ${maskApiKey((ctx.config.vision as any)?.key)}`,
            "",
            "  command file  ~/.dscode/config.json",
            "  settings      ~/.dscode/settings.json",
            "  project       <project>/.dscode/settings.json",
            "",
            "Type /config help for usage.",
          ];
          ctx.tui.addInfo("Configuration:\n" + lines.join("\n"));
        }
      }
    },
  },
  {
    name: "image",
    description: "Attach an image (file path or 'clipboard')",
    execute: async (args, ctx) => {
      const target = args.trim();
      if (!target) {
        ctx.tui.addError("Usage: /image <filepath> or /image clipboard");
        return;
      }
      if (target === "clipboard") {
        const img = await readClipboardImage();
        if (!img) {
          ctx.tui.addError("No image found in clipboard (macOS only)");
          return;
        }
        ctx.tui.addPendingImage(img);
        ctx.tui.addInfo(
          `Image attached from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`,
        );
        return;
      }
      try {
        const img = await readImageFile(target);
        ctx.tui.addPendingImage(img);
        ctx.tui.addInfo(
          `Image attached: ${target} (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`,
        );
      } catch {
        ctx.tui.addError(`Cannot read image: ${target}`);
      }
    },
  },
];

export function getSlashCommandAutocomplete(): AutocompleteSlashCommand[] {
  return COMMANDS.map((c) => ({ name: c.name, description: c.description }));
}

export type { CommandContext };

export function executeSlashCommand(
  raw: string,
  ctx: Omit<CommandContext, "tui">,
  tui: TuiApp,
): void {
  const [cmdName, ...argParts] = raw.slice(1).split(/\s+/);
  const cmd = COMMANDS.find((c) => c.name === cmdName);
  if (!cmd) {
    tui.addError(`Unknown command: /${cmdName}. Type /help`);
    return;
  }
  const fullCtx: CommandContext = { ...ctx, tui };
  Promise.resolve(cmd.execute(argParts.join(" "), fullCtx)).catch((err) => {
    tui.addError(err instanceof Error ? err.message : String(err));
  });
}