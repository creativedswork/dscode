import type { SlashCommand as AutocompleteSlashCommand } from "@earendil-works/pi-tui";
import type { CommandManifest } from "../core/types.js";

import type { HarnessAPI } from "../core/harness-api.js";
import type { UiBackend } from "./backend.js";
import { saveUserConfig, maskApiKey, PROVIDER_ENV_VARS } from "../core/config.js";
import { getAllProviders, getAllModels, getVisionModels, getVisionProviders } from "../models/index.js";
import { readImageFile, readClipboardImage } from "../utils/image.js";

function fmtLocalDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtLocalTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtLocalDateTime(ts: number): string {
  return `${fmtLocalDate(ts)} ${fmtLocalTime(ts)}`;
}
import { runEval } from "../eval/index.js";

interface SlashCommandContext {
  harness: HarnessAPI;
  ui: UiBackend;
  commandManager?: { getManifest(name: string): CommandManifest | undefined; listManifests(): CommandManifest[] };
}

interface SlashCommandDef {
  name: string;
  description: string;
  source?: "builtin" | "custom";
  execute(args: string, ctx: SlashCommandContext): void | Promise<void>;
}

const COMMANDS: SlashCommandDef[] = [
  {
    name: "help",
    description: "Show help (/help config | mcp | session | memory | skills | drivers | permissions | image | commands)",
    execute: async (args, ctx) => {
      const topic = args.trim();

      const overview = [
        "Type a message to chat with the AI. Use slash commands for operations.",
        "",
        "Quick start:",
        "  /config key <api-key>      Set your API key",
        "  /config model <model-id>   Choose a model",
        "",
        "Commands:",
        ...COMMANDS.filter(c => c.name !== "help").map((c) => `  /${c.name.padEnd(14)} ${c.description}`),
        "",
        "Type /help <topic> for details: config  mcp  session  memory  skills  drivers  permissions  image  commands",
      ];

      const topics: Record<string, string[]> = {
        config: [
          "/config                  Show current configuration",
          "/config key <api-key>     Set your DeepSeek (or other provider) API key",
          "/config model <id>        Switch model (e.g. deepseek-v4-pro, deepseek-v4-flash)",
          "/config provider <id>     Switch provider (deepseek, openai, kimi-coding, qwen, ...)",
          "/config thinking <level>  Set reasoning effort: off | minimal | low | medium | high | xhigh",
          "/config vision-provider <id>  Set provider for image understanding",
          "/config vision-model <id>     Set model for image understanding",
          "/config vision-key <key>      Set API key for vision model",
          "/config cwd <path>        Set working directory for this project",
          "",
          "Configuration files:",
          "  ~/.dscode/config.json          Runtime config (managed by /config)",
          "  ~/.dscode/settings.json        User-level settings (permissions, skills)",
          "  <project>/.dscode/settings.json  Project-level settings (overrides user-level)",
          "  ~/.mcp.json                    User-level MCP servers (all projects)",
          "  <project>/.mcp.json              Project MCP servers (sensitive, gitignore)",
          "",
          "Settings example (~/.dscode/settings.json):",
          "  {\"permissions\": {\"deny\": [\"*.env\", \"*.secret\"]}}",
          "  {\"skills\": [\"my-custom-skill\"]}",
          "See docs/ARCHITECTURE.md for the full settings schema.",
        ],
        mcp: [
          "dscode is MCP-first. Configure MCP servers in .mcp.json files:",
          "  ~/.mcp.json           User MCP servers (all projects)",
          "  <project>/.mcp.json   Project MCP servers (add to .gitignore)",
          "",
          "  {\"mcpServers\": {",
          "    \"blender\": {\"command\": \"uvx\", \"args\": [\"blender-mcp\"]},",
          "    \"playwright\": {\"command\": \"npx\", \"args\": [\"@anthropic/mcp-playwright\"]},",
          "    \"remote-api\": {\"url\": \"https://api.example.com/mcp\"}",
          "  }}",
          "",
          "Transport auto-detection:",
          "  command present           → stdio",
          "  url only, no command      → Streamable HTTP (MCP 2025-11-25)",
          "  url + transport: \"sse\"    → Legacy SSE fallback",
          "",
          "Tools appear as mcp_<server>_<tool>. Use /mcp to browse connected servers.",
          "",
          "Tool Search:",
          "  MCP tools are NOT all loaded at once. The model calls search_tools",
          "  to discover tools on-demand, preventing context explosion even with",
          "  dozens of MCP servers connected.",
        ],
        session: [
          "Session management — conversations are auto-saved and resumable.",
          "",
          "/session list              List sessions for current project",
          "/session list --all        List all sessions across all projects",
          "/session load <id>         Resume a previous session",
          "/session save              Force-save current session",
          "/session delete <id>       Delete a session",
          "",
          "Sessions are stored in ~/.dscode/data/sessions/ as JSON files.",
          "Each session has a ULID (time-sortable, 26 chars). Use the first 8 chars",
          "as a shorthand for load/delete commands.",
        ],
        memory: [
          "Memory system — persistent knowledge across sessions.",
          "",
          "/memory list               List memories (current project)",
          "/memory list global        List global memories",
          "/memory list project       List project memories",
          "/memory add <content>      Add a project memory",
          "/memory add global <text>  Add a global memory",
          "/memory remove <id>        Remove a memory",
          "/memory clear              Clear all project memories",
          "",
          "Memories are automatically injected into the system prompt at session",
          "start. Categories: preference (user habits), fact (project facts),",
          "instruction (persistent directives).",
          "",
          "Data: ~/.dscode/data/memory/global.json + projects/<hash>.json",
        ],
        skills: [
          "Skills — declarative third-party extensions via SKILL.md.",
          "",
          "/skills                    List all available skills (active/inactive)",
          "/skills activate <name>    Activate a skill (adds its instructions to",
          "                            system prompt + enables its allowed tools)",
          "/skills deactivate <name>  Deactivate a skill",
          "",
          "Skills are loaded from:",
          "  ~/.dscode/skills/<name>/SKILL.md        User-level",
          "  <project>/.dscode/skills/<name>/SKILL.md  Project-level",
          "",
          "A SKILL.md declares: name, description, allowed tools, and instructions",
          "that get injected into the system prompt when activated.",
        ],
        drivers: [
          "Drivers are kernel-level tool providers, always loaded.",
          "",
          "Built-in drivers:",
          "  fs      read_file, write_file, overwrite_file, list_files",
          "  shell   bash",
          "  search  grep, glob",
          "  edit    edit (hash-anchor based: replace, insert, delete by content hash)",
          "  discovery  search_tools (on-demand MCP tool loading)",
          "",
          "MCP servers also register as drivers at runtime. Use /drivers to list all.",
        ],
        permissions: [
          "Permission system — intercepts tool calls before execution.",
          "",
          "/permissions               Show session-level grants",
          "",
          "Read tools (read_file, list_files, grep, glob) are always allowed.",
          "Write tools (write_file, edit) ask for confirmation.",
          "Dangerous bash patterns (rm -rf, sudo, chmod 777, mkfs, dd) are blocked.",
          "Other bash commands ask for confirmation.",
          "",
          "During a permission prompt you can choose:",
          "  Y)es  — allow this once",
          "  N)o   — deny this once",
          "  A)lways allow — grant for the rest of this session",
          "",
          "Configure in ~/.dscode/settings.json:",
          "  {\"permissions\": {\"deny\": [\"*.env\", \"*.key\"]}}",
        ],
        image: [
          "Image / vision input:",
          "",
          "/image <filepath>          Attach an image file to the next message",
          "/image clipboard           Attach image from clipboard (macOS)",
          "",
          "In Web UI: paste images (Ctrl+V). Drag-and-drop files to attach them (Web UI and TUI).",
          "",
          "Vision pipeline:",
          "  If the primary model supports images → routed directly.",
          "  If not → transparently routed to a configured vision model (GPT-4o,",
          "           Claude, Gemini, etc.) via /config vision-provider / vision-model.",
          "  OCR fallback: tesseract.js for text extraction (ENG + CHI).",
        ],
        commands: [
          "Full command reference:",
          "",
          ...COMMANDS.map((c) => `  /${c.name.padEnd(14)} ${c.description}`),
        ],
      };

      if (topic && topics[topic]) {
        (ctx.ui as any).addInfo(topics[topic].join("\n"));
      }
      if (topic) {
        (ctx.ui as any).addError(`Unknown help topic: ${topic}. Try: ${Object.keys(topics).join("  ")}`);
        return;
      }
      (ctx.ui as any).addInfo(overview.join("\n"));
    },
  },
  {
    name: "reset",
    description: "Clear conversation history and start a new session",
    execute: async (_args, ctx) => {
      // Save the current session before resetting
      ctx.harness.sessionManager.trySaveSession(ctx.harness.agent);
      // Create and persist a new empty session so it shows in the list
      ctx.harness.sessionManager.createSession(ctx.harness.config.provider, ctx.harness.config.modelId);
      ctx.harness.sessionManager.persistEmptySession();
      // Clear agent state and UI
      ctx.harness.agent.reset();
      (ctx.ui as any).clearConversationView();
      ctx.harness.rebuildSystemPrompt();
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
            ? ctx.harness.sessionManager.listAllSessions()
            : ctx.harness.sessionManager.listSessions();
          if (sessions.length === 0) {
            const msg = all
              ? "No saved sessions."
              : "No sessions in this project. Start a conversation to create one.";
            (ctx.ui as any).addInfo(msg);
          }
          const currentId = ctx.harness.sessionManager.getCurrentSessionId();
          const header = all
            ? "All sessions:"
            : `Sessions (project: ${ctx.harness.config.projectPath}):`;
          const lines = sessions.slice(0, 30).map((s) => {
            const date = fmtLocalDate(s.updatedAt);
            const time = fmtLocalTime(s.updatedAt);
            const marker = s.id === currentId ? "*" : " ";
            const title = `"${s.title.slice(0, 60)}"`;
            return `${marker} ${s.id.slice(0, 8)} ${title}  ${s.modelProvider}/${s.modelId}  ${date} ${time}  ${s.messageCount} msgs`;
          });
          (ctx.ui as any).addInfo(header + "\n" + lines.join("\n"));
          break;
        }
        case "save":
          try {
            ctx.harness.sessionManager.saveSession(ctx.harness.agent);
            (ctx.ui as any).addInfo("Session saved.");
          } catch (err: any) {
            (ctx.ui as any).addError(`Failed to save session: ${err.message}`);
          }
          break;
        case "load": {
          const id = rest[0];
          if (!id) { (ctx.ui as any).addError("Usage: /session load <id>"); return; }
          const pendingPermission = (ctx.ui as any).takePendingPermission?.();
          const result = await ctx.harness.switchSession({
            sessionIdOrPrefix: id,
            pendingPermission,
          });
          const match = result.session;
          const lines = [
            `Loaded session: ${match.id.slice(0, 8)}`,
            `  Title:    "${match.title}"`,
            `  Model:    ${match.modelProvider} / ${match.modelId}`,
            `  Project:  ${match.projectPath || "(unscoped)"}`,
            `  Created:  ${fmtLocalDateTime(match.createdAt)}`,
            `  Activity: ${fmtLocalDateTime(match.updatedAt)}`,
            `  Messages: ${match.messageCount}`,
          ];
          (ctx.ui as any).addInfo(lines.join("\n"));
          (ctx.ui as any).clearConversationView();
          (ctx.ui as any).replayMessages(ctx.harness.agent.state.messages as unknown[]);
          break;
        }
        case "delete": {
          const id = rest[0];
          if (!id) { (ctx.ui as any).addError("Usage: /session delete <id>"); return; }
          const result = ctx.harness.sessionManager.deleteSession(id);
          if (!result.success) {
            (ctx.ui as any).addError(`Failed to delete session: ${result.error}`);
            return;
          }
          (ctx.ui as any).addInfo("Session deleted.");
          break;
        }
        default:
          (ctx.ui as any).addError("Usage: /session [list|save|load|delete]");
      }
    },
  },
  {
    name: "memory",
    description: "Memory management (list|add|remove|clear)",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      const sessionId = ctx.harness.sessionManager.getCurrentSessionId() ?? "unknown";
      switch (sub) {
        case "list": {
          const scope = rest[0] as "global" | "project" | undefined;
          const entries = ctx.harness.memoryManager.listMemories(scope);
          if (entries.length === 0) {
            (ctx.ui as any).addInfo("No memories stored.");
            return;
          }
          const lines = entries.map((m) => `  [${m.scope}] ${m.content} (${m.id})`);
          (ctx.ui as any).addInfo("Memories:\n" + lines.join("\n"));
          break;
        }
        case "add": {
          const content = rest.join(" ");
          if (!content) { (ctx.ui as any).addError("Usage: /memory add <content>"); return; }
          ctx.harness.memoryManager.addMemory(content, "project", sessionId);
          (ctx.ui as any).addInfo("Memory added.");
          break;
        }
        case "remove": {
          const id = rest[0];
          if (!id) { (ctx.ui as any).addError("Usage: /memory remove <id>"); return; }
          ctx.harness.memoryManager.removeMemory(id);
          (ctx.ui as any).addInfo("Memory removed.");
          break;
        }
        case "clear": {
          const scope = rest[0] as "global" | "project" | undefined;
          ctx.harness.memoryManager.clearMemories(scope);
          (ctx.ui as any).addInfo("Memories cleared.");
          break;
        }
        default:
          (ctx.ui as any).addError("Usage: /memory [list|add|remove|clear]");
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
          if (!name) { (ctx.ui as any).addError("Usage: /skills activate <name>"); return; }
          try {
            const skill = ctx.harness.skillManager.activate(name, ctx.harness.driverRegistry);
            ctx.harness.agent.state.tools = ctx.harness.toolRegistry.buildToolsForRequest();
            const toolNames = skill.tools.map((t) => t.name).join(", ");
            (ctx.ui as any).addInfo(`Activated: ${name} (allowed tools: ${toolNames || "none"})`);
          } catch (err: any) {
            (ctx.ui as any).addError(err.message);
          }
          break;
        }
        case "deactivate": {
          const name = rest[0];
          if (!name) { (ctx.ui as any).addError("Usage: /skills deactivate <name>"); return; }
          ctx.harness.skillManager.deactivate(name);
          ctx.harness.agent.state.tools = ctx.harness.toolRegistry.buildToolsForRequest();
          (ctx.ui as any).addInfo(`Deactivated: ${name}`);
          break;
        }
        default: {
          const lines: string[] = [];
          for (const { skill, active } of ctx.harness.skillManager.listAll()) {
            const status = active ? "active" : "inactive";
            lines.push(`  ${skill.name} [${status}] (${skill.source}) — ${skill.description}`);
          }
          (ctx.ui as any).addInfo("Skills:\n" + lines.join("\n"));
        }
      }
    },
  },
  {
    name: "drivers",
    description: "List loaded drivers",
    execute: async (_args, ctx) => {
      const lines: string[] = [];
      for (const d of ctx.harness.driverRegistry.listAll()) {
        const toolNames = d.tools.map((t) => t.name).join(", ");
        lines.push(`  ${d.name} (${d.source}) — ${d.description}`);
        lines.push(`    tools: ${toolNames}`);
      }
      (ctx.ui as any).addInfo("Drivers:\n" + lines.join("\n"));
    },
  },
  {
    name: "mcp",
    description: "Browse MCP servers and tools",
    execute: async (_args, ctx) => {
      if (!ctx.harness.mcpManager || ctx.harness.mcpManager.getStates().length === 0) {
        (ctx.ui as any).addInfo("No MCP servers configured.");
        return;
      }
      (ctx.ui as any).openMcpBrowser();
    },
  },
  {
    name: "permissions",
    description: "Show session permission grants",
    execute: async (_args, ctx) => {
      const grants = ctx.harness.permissionManager.getSessionGrants();
      if (grants.length === 0) {
        (ctx.ui as any).addInfo("No session-level grants.");
        return;
      }
      const lines = grants.map((g) => `  ✓ ${g}`);
      (ctx.ui as any).addInfo("Session grants:\n" + lines.join("\n"));
    },
  },
  {
    name: "cost",
    description: "Show token usage for this session",
    execute: async (_args, ctx) => {
      const msgs = ctx.harness.agent.state.messages;
      const tokens = ctx.harness.contextManager.getEstimatedTokens(msgs);
      (ctx.ui as any).addInfo(`Estimated context: ~${tokens} tokens (${msgs.length} messages)`);
    },
  },
  {
    name: "compact",
    description: "Force context compaction",
    execute: async (_args, ctx) => {
      const before = ctx.harness.agent.state.messages.length;
      const compacted = await ctx.harness.contextManager.transform(ctx.harness.agent.state.messages);
      ctx.harness.agent.state.messages = compacted as any;
      const after = ctx.harness.agent.state.messages.length;
      (ctx.ui as any).addInfo(`Compacted: ${before} → ${after} messages`);
    },
  },
  {
    name: "eval",
    description: "Analyze a session using CHIFF causal graph analysis (/eval [session_id])",
    execute: async (args, ctx) => {
      const sessionId = args.trim() || null;
      await runEval(sessionId, ctx);
    },
  },
  {
    name: "config",
    description: "Show or change user command config",
    execute: async (args, ctx) => {
      const [sub, ...rest] = args.split(/\s+/);
      switch (sub) {
        case "help": {
          (ctx.ui as any).addInfo([
            "/config                  Show current user command config",
            "/config provider <id>     Switch provider (no restart needed)",
            "/config model <id>       Switch model (saved to ~/.dscode/config.json)",
            "/config thinking <level> Set thinking level (saved to ~/.dscode/config.json)",
            "/config key <api-key>    Set your API key",
            "/config vision-provider <id>  Set vision model provider",
            "/config vision-model <id>    Set vision model",
            "/config vision-key <key>     Set vision model API key",
            "/config cwd <path>       Set working directory for this session (takes effect immediately)",
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
            const current = ctx.harness.config.provider;
            const lines = available.map((p) => p === current ? `  * ${p} (current)` : `  ${p}`);
            (ctx.ui as any).addInfo(`Available providers:\n${lines.join("\n")}\n\nUsage: /config provider <provider-id>`);
            return;
          }
          try {
            ctx.harness.setProvider(providerId);
            (ctx.ui as any).addInfo(`Provider switched to: ${providerId}. Default model selected. Conversation reset.`);
          } catch (err: any) {
            (ctx.ui as any).addError(err.message);
          }
          break;
        }

        case "model": {
          const modelId = rest[0];
          if (!modelId) {
            const available = getAllModels(ctx.harness.config.provider);
            const models = available.map((m) => `  ${m.id} — ${m.name}`);
            (ctx.ui as any).addInfo(`Models for ${ctx.harness.config.provider}:\n${models.join("\n")}\n\nUsage: /config model <model-id>`);
            return;
          }
          ctx.harness.setModel(modelId);
          (ctx.ui as any).addInfo(`Model switched to: ${modelId}`);
          break;
        }
        case "cwd": {
          const cwd = rest.join(" ");
          if (!cwd) {
            (ctx.ui as any).addInfo(`Current working directory: ${ctx.harness.config.projectPath}\n\nUsage: /config cwd <path>`);
            return;
          }
          const result = await ctx.harness.updateProjectPath(cwd);
          if (result.success) {
            (ctx.ui as any).addInfo(`Working directory changed to: ${ctx.harness.config.projectPath}`);
          } else {
            (ctx.ui as any).addError(result.error ?? "Failed to change working directory");
          }
          break;
        }
        case "key": {
          const key = rest.join(" ");
          if (!key) {
            (ctx.ui as any).addError("Usage: /config key <api-key>");
            return;
          }
          saveUserConfig({ apiKey: key });
          ctx.harness.configStore.setApiKey(key);
          const envVar = PROVIDER_ENV_VARS[ctx.harness.config.provider] ?? "DEEPSEEK_API_KEY";
          process.env[envVar] = key;
          if (envVar !== "DEEPSEEK_API_KEY") {
            process.env.DEEPSEEK_API_KEY = key;
          }
          (ctx.ui as any).addInfo(`API key saved to ~/.dscode/config.json: ${maskApiKey(key)}`);
          break;
        }
        case "thinking": {
          const level = rest[0];
          const valid = ["off", "minimal", "low", "medium", "high", "xhigh"];
          if (!level || !valid.includes(level)) {
            (ctx.ui as any).addError(`Usage: /config thinking <${valid.join("|")}>`);
            return;
          }
          ctx.harness.setThinking(level);
          (ctx.ui as any).addInfo(`Thinking level set to: ${level}`);
          break;
        }
        case "vision-provider": {
          const vpId = rest[0];
          if (!vpId) {
            const available = getVisionProviders();
            const current = (ctx.harness.config.vision as any)?.provider;
            const lines = available.map((p) => p === current ? `  * ${p} (current)` : `  ${p}`);
            (ctx.ui as any).addInfo(`Available providers for vision model:\n${lines.join("\n")}\n\nUsage: /config vision-provider <provider-id>`);
            return;
          }
          try {
            const v = { provider: vpId } as any;
            saveUserConfig({ vision: v });
            ctx.harness.configStore.updateVision({ provider: vpId });
            (ctx.ui as any).addInfo(`Vision provider set to: ${vpId}`);
          } catch (err: any) {
            (ctx.ui as any).addError(err.message);
          }
          break;
        }
        case "vision-model": {
          const vmId = rest[0];
          if (!vmId) {
            const vp = (ctx.harness.config.vision as any)?.provider;
            if (!vp) {
              (ctx.ui as any).addError("No vision provider configured. Set it first: /config vision-provider <id>");
              return;
            }
            const available = getVisionModels(vp);
            const models = available.map((m) => `  ${m.id} — ${m.name}`);
            (ctx.ui as any).addInfo(`Models for vision provider ${vp}:\n${models.join("\n")}\n\nUsage: /config vision-model <model-id>`);
            return;
          }
          const vp = (ctx.harness.config.vision as any)?.provider;
          if (!vp) {
            (ctx.ui as any).addError("No vision provider configured. Set it first: /config vision-provider <id>");
            return;
          }
          try {
            const existingKey = (ctx.harness.config.vision as any)?.key;
            const v = { provider: vp, model: vmId, key: existingKey };
            saveUserConfig({ vision: v });
            ctx.harness.configStore.updateVision({ model: vmId });
            (ctx.ui as any).addInfo(`Vision model set to: ${vmId}`);
          } catch (err: any) {
            (ctx.ui as any).addError(err.message);
          }
          break;
        }
        case "vision-key": {
          const key = rest.join(" ");
          if (!key) {
            (ctx.ui as any).addError("Usage: /config vision-key <api-key>");
            return;
          }
          const vp = (ctx.harness.config.vision as any)?.provider ?? "";
          const vm = (ctx.harness.config.vision as any)?.model ?? "";
          const v = { provider: vp, model: vm, key };
          saveUserConfig({ vision: v });
          ctx.harness.configStore.updateVision({ key });
          (ctx.ui as any).addInfo(`Vision API key saved to ~/.dscode/config.json: ${maskApiKey(key)}`);
          break;
        }
        default: {
          const lines = [
            `  provider      ${ctx.harness.config.provider}`,
            `  model         ${ctx.harness.config.modelId}`,
            `  key           ${maskApiKey(ctx.harness.config.apiKey)}`,
            `  cwd           ${ctx.harness.config.projectPath}`,
            `  maxTokens     ${ctx.harness.config.maxTokens}`,
            `  thinking      ${ctx.harness.config.thinkingLevel}`,
            `  vision-provider  ${(ctx.harness.config.vision as any)?.provider ?? "(not set)"}`,
            `  vision-model     ${(ctx.harness.config.vision as any)?.model ?? "(not set)"}`,
            `  vision-key       ${maskApiKey((ctx.harness.config.vision as any)?.key)}`,
            "",
            "  command file  ~/.dscode/config.json",
            "  settings      ~/.dscode/settings.json",
            "  project       <project>/.dscode/settings.json",
            "",
            "Type /config help for usage.",
          ];
          (ctx.ui as any).addInfo("Configuration:\n" + lines.join("\n"));
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
        (ctx.ui as any).addError("Usage: /image <filepath> or /image clipboard");
        return;
      }
      if (target === "clipboard") {
        const img = await readClipboardImage();
        if (!img) {
          (ctx.ui as any).addError("No image found in clipboard (macOS only)");
          return;
        }
        (ctx.ui as any).addPendingImage(img);
        (ctx.ui as any).addInfo(
          `Image attached from clipboard (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`,
        );
        return;
      }
      try {
        const img = await readImageFile(target);
        (ctx.ui as any).addPendingImage(img);
        (ctx.ui as any).addInfo(
          `Image attached: ${target} (${img.mimeType}, ${Math.round(img.data.length * 0.75 / 1024)} KB)`,
        );
      } catch {
        (ctx.ui as any).addError(`Cannot read image: ${target}`);
      }
    },
  },
];

export function getSlashCommandAutocomplete(customCommands?: CommandManifest[]): AutocompleteSlashCommand[] {
  const custom = (customCommands ?? []).map((c) => ({ name: c.name, description: c.description }));
  const builtin = COMMANDS.map((c) => ({ name: c.name, description: c.description }));
  return [...custom, ...builtin];
}


export function executeSlashCommand(
  text: string,
  ctx: SlashCommandContext,
): Promise<string | undefined> {
  if (!text.startsWith("/")) return Promise.resolve(undefined);
  const spaceIdx = text.indexOf(" ");
  const commandName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();

  // Built-in commands take priority on name conflict
  const cmd = COMMANDS.find((c) => c.name === commandName);
  if (!cmd) return Promise.resolve(undefined);

  return (async () => {
    try {
      await cmd.execute(args, ctx);
      return commandName;
    } catch (err) {
      (ctx.ui as any).addError(`${commandName}: ${err instanceof Error ? err.message : String(err)}`);
      return commandName;
    }
  })();
}

/** Execute a custom command: resolve $input placeholder and return the expanded prompt text */
export function resolveCustomCommand(
  text: string,
  ctx: SlashCommandContext,
): string | undefined {
  if (!text.startsWith("/")) return undefined;
  const spaceIdx = text.indexOf(" ");
  const commandName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();

  // Built-in commands are NOT resolved here — those are handled by executeSlashCommand
  const builtin = COMMANDS.find((c) => c.name === commandName);
  if (builtin) return undefined;

  if (!ctx.commandManager) return undefined;
  const manifest = ctx.commandManager.getManifest(commandName);
  if (!manifest) return undefined;

  // Replace $input with user args, or append args at end if no $input placeholder
  if (manifest.body.includes("$input")) {
    return manifest.body.replace(/\$input/g, args);
  }
  if (args) {
    return manifest.body + "\n\n" + args;
  }
  return manifest.body;
}
