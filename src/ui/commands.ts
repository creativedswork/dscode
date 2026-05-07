import type { Agent } from "@mariozechner/pi-agent-core";

import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import { TerminalRenderer, colors } from "./render.js";

const { DIM, GREEN, YELLOW, CYAN, BOLD, RESET } = colors;

interface CommandContext {
  agent: Agent;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  renderer: TerminalRenderer;
}

interface SlashCommand {
  name: string;
  description: string;
  execute(args: string, ctx: CommandContext): Promise<void>;
}

export const COMMANDS: SlashCommand[] = [
  {
    name: "help",
    description: "Show available commands",
    execute: async (_args, ctx) => {
      console.log(`\n${BOLD}Available commands:${RESET}`);
      for (const cmd of COMMANDS) {
        console.log(`  ${GREEN}/${cmd.name}${RESET}  ${DIM}${cmd.description}${RESET}`);
      }
      console.log();
    },
  },
  {
    name: "reset",
    description: "Clear conversation history",
    execute: async (_args, ctx) => {
      ctx.agent.reset();
      ctx.renderer.renderInfo("(conversation reset)");
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
            ctx.renderer.renderInfo("No saved sessions.");
            return;
          }
          console.log(`\n${BOLD}Sessions:${RESET}`);
          for (const s of sessions.slice(0, 20)) {
            const date = new Date(s.updatedAt).toLocaleDateString();
            console.log(`  ${DIM}${s.id.slice(0, 8)}${RESET} ${s.title} ${DIM}(${date}, ${s.messageCount} msgs)${RESET}`);
          }
          console.log();
          break;
        }
        case "save":
          ctx.sessionManager.saveSession(ctx.agent);
          ctx.renderer.renderInfo("Session saved.");
          break;
        case "load": {
          const id = rest[0];
          if (!id) { ctx.renderer.renderError("Usage: /session load <id>"); return; }
          const sessions = ctx.sessionManager.listSessions();
          const match = sessions.find((s) => s.id.startsWith(id));
          if (!match) { ctx.renderer.renderError(`Session not found: ${id}`); return; }
          ctx.sessionManager.loadSession(match.id, ctx.agent);
          ctx.renderer.renderInfo(`Loaded session: ${match.title}`);
          break;
        }
        case "delete": {
          const id = rest[0];
          if (!id) { ctx.renderer.renderError("Usage: /session delete <id>"); return; }
          ctx.sessionManager.deleteSession(id);
          ctx.renderer.renderInfo("Session deleted.");
          break;
        }
        default:
          ctx.renderer.renderError("Usage: /session [list|save|load|delete]");
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
            ctx.renderer.renderInfo("No memories stored.");
            return;
          }
          console.log(`\n${BOLD}Memories:${RESET}`);
          for (const m of entries) {
            console.log(`  ${DIM}[${m.scope}]${RESET} ${m.content} ${DIM}(${m.id})${RESET}`);
          }
          console.log();
          break;
        }
        case "add": {
          const content = rest.join(" ");
          if (!content) { ctx.renderer.renderError("Usage: /memory add <content>"); return; }
          ctx.memoryManager.addMemory(content, "project", sessionId);
          ctx.renderer.renderInfo("Memory added.");
          break;
        }
        case "remove": {
          const id = rest[0];
          if (!id) { ctx.renderer.renderError("Usage: /memory remove <id>"); return; }
          ctx.memoryManager.removeMemory(id);
          ctx.renderer.renderInfo("Memory removed.");
          break;
        }
        case "clear": {
          const scope = rest[0] as "global" | "project" | undefined;
          ctx.memoryManager.clearMemories(scope);
          ctx.renderer.renderInfo("Memories cleared.");
          break;
        }
        default:
          ctx.renderer.renderError("Usage: /memory [list|add|remove|clear]");
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
          if (!name) { ctx.renderer.renderError("Usage: /skills activate <name>"); return; }
          try {
            const skill = ctx.skillManager.activate(name, ctx.driverRegistry);
            ctx.agent.state.tools = [
              ...ctx.driverRegistry.getAllTools(),
              ...ctx.skillManager.getTools(),
            ];
            const toolNames = skill.tools.map((t) => t.name).join(", ");
            ctx.renderer.renderInfo(`Activated: ${name} (allowed tools: ${toolNames || "none"})`);
          } catch (err: any) {
            ctx.renderer.renderError(err.message);
          }
          break;
        }
        case "deactivate": {
          const name = rest[0];
          if (!name) { ctx.renderer.renderError("Usage: /skills deactivate <name>"); return; }
          ctx.skillManager.deactivate(name);
          ctx.agent.state.tools = [
            ...ctx.driverRegistry.getAllTools(),
            ...ctx.skillManager.getTools(),
          ];
          ctx.renderer.renderInfo(`Deactivated: ${name}`);
          break;
        }
        default: {
          console.log(`\n${BOLD}Skills:${RESET}`);
          for (const { skill, active } of ctx.skillManager.listAll()) {
            const status = active ? `${GREEN}active${RESET}` : `${DIM}inactive${RESET}`;
            const source = `${DIM}(${skill.source})${RESET}`;
            console.log(`  ${skill.name} [${status}] ${source} ${DIM}— ${skill.description}${RESET}`);
          }
          console.log();
        }
      }
    },
  },
  {
    name: "drivers",
    description: "List loaded drivers",
    execute: async (_args, ctx) => {
      console.log(`\n${BOLD}Drivers:${RESET}`);
      for (const d of ctx.driverRegistry.listAll()) {
        const source = `${DIM}(${d.source})${RESET}`;
        const toolNames = d.tools.map((t) => t.name).join(", ");
        console.log(`  ${d.name} ${source} ${DIM}— ${d.description}${RESET}`);
        console.log(`    ${DIM}tools: ${toolNames}${RESET}`);
      }
      console.log();
    },
  },
  {
    name: "permissions",
    description: "Show session permission grants",
    execute: async (_args, ctx) => {
      const grants = ctx.permissionManager.getSessionGrants();
      if (grants.length === 0) {
        ctx.renderer.renderInfo("No session-level grants.");
        return;
      }
      console.log(`\n${BOLD}Session grants:${RESET}`);
      for (const g of grants) {
        console.log(`  ${GREEN}✓${RESET} ${g}`);
      }
      console.log();
    },
  },
  {
    name: "cost",
    description: "Show token usage for this session",
    execute: async (_args, ctx) => {
      const msgs = ctx.agent.state.messages;
      const tokens = ctx.contextManager.getEstimatedTokens(msgs);
      console.log(`\n${BOLD}Estimated context:${RESET} ~${tokens} tokens (${msgs.length} messages)\n`);
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
      ctx.renderer.renderInfo(`Compacted: ${before} → ${after} messages`);
    },
  },
];
