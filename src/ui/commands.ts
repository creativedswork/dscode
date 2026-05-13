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
import { saveUserConfig, saveProjectConfig, maskApiKey } from "../core/config.js";
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
      ctx.tui.addInfo("(conversation reset)");
    },
  },
  {
    name: "session",
    description: "Session management (list|save|load|delete)",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      switch (sub) {
        case "list": {
          const sessions = ctx.sessionManager.listSessions();
          if (sessions.length === 0) {
            ctx.tui.addInfo("No saved sessions.");
            return;
          }
          const lines = sessions.slice(0, 20).map((s) => {
            const date = new Date(s.updatedAt).toLocaleDateString();
            return `  ${s.id.slice(0, 8)} ${s.title} (${date}, ${s.messageCount} msgs)`;
          });
          ctx.tui.addInfo("Sessions:\n" + lines.join("\n"));
          break;
        }
        case "save":
          ctx.sessionManager.saveSession(ctx.agent);
          ctx.tui.addInfo("Session saved.");
          break;
        case "load": {
          const id = rest[0];
          if (!id) { ctx.tui.addError("Usage: /session load <id>"); return; }
          const sessions = ctx.sessionManager.listSessions();
          const match = sessions.find((s) => s.id.startsWith(id));
          if (!match) { ctx.tui.addError(`Session not found: ${id}`); return; }
          ctx.sessionManager.loadSession(match.id, ctx.agent);
          ctx.tui.addInfo(`Loaded session: ${match.title}`);
          break;
        }
        case "delete": {
          const id = rest[0];
          if (!id) { ctx.tui.addError("Usage: /session delete <id>"); return; }
          ctx.sessionManager.deleteSession(id);
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
    description: "Show or change configuration (model|cwd|key)",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      switch (sub) {
        case "help": {
          ctx.tui.addInfo([
            "/config                  Show current settings",
            "/config model <id>       Switch model (e.g., deepseek-v4-pro, deepseek-chat)",
            "/config thinking <level> Set thinking level (off|minimal|low|medium|high|xhigh)",
            "/config key <api-key>    Set your DeepSeek API key",
            "/config cwd <path>       Set working directory (restart to apply)",
            "/config help             Show this help",
          ].join("\n"));
          break;
        }
        case "model": {
          const modelId = rest[0];
          if (!modelId) {
            ctx.tui.addError("Usage: /config model <model-id>");
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
          saveProjectConfig({ cwd: resolvedCwd }, ctx.config.projectPath);
          ctx.tui.addInfo(`CWD set to: ${resolvedCwd} (restart required to take effect)`);
          break;
        }
        case "key": {
          const key = rest.join(" ");
          if (!key) {
            ctx.tui.addError("Usage: /config key <api-key>");
            return;
          }
          saveUserConfig({ apiKey: key });
          process.env.DEEPSEEK_API_KEY = key;
          ctx.tui.addInfo(`API key saved: ${maskApiKey(key)}`);
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
        default: {
          const lines = [
            `  provider     ${ctx.config.provider}`,
            `  model        ${ctx.config.modelId}`,
            `  apiKey       ${maskApiKey(ctx.config.apiKey)}`,
            `  cwd          ${ctx.config.projectPath}`,
            `  maxTokens    ${ctx.config.maxTokens}`,
            `  thinking     ${ctx.config.thinkingLevel}`,
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
