import { createInterface } from "node:readline/promises";

import type { Agent } from "@mariozechner/pi-agent-core";

import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { SkillRegistry } from "../skills/registry.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import { TerminalRenderer, colors } from "./render.js";
import { COMMANDS } from "./commands.js";

const { DIM, GREEN, MAGENTA, BOLD, RESET, YELLOW } = colors;

interface ReplDeps {
  agent: Agent;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  skillRegistry: SkillRegistry;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  renderer: TerminalRenderer;
  modelName: string;
}

export async function runRepl(deps: ReplDeps): Promise<void> {
  const { agent, renderer, modelName } = deps;
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const commandMap = new Map(COMMANDS.map((c) => [c.name, c]));

  // welcome
  console.log(`\n${BOLD}Agent Harness${RESET}  ${DIM}(${modelName})${RESET}`);
  console.log(`${DIM}Type a message. /help for commands. exit to quit.${RESET}\n`);

  // Ctrl+C handling
  let lastCtrlC = 0;
  process.on("SIGINT", () => {
    if (agent.state.isStreaming) {
      agent.abort();
      renderer.renderInfo("\n(aborted)");
      return;
    }
    const now = Date.now();
    if (now - lastCtrlC < 500) {
      rl.close();
      process.exit(0);
    }
    lastCtrlC = now;
    renderer.renderInfo("\nPress Ctrl+C again to exit");
  });

  try {
    while (true) {
      let raw: string;
      try {
        raw = await rl.question(`${GREEN}you ›${RESET} `);
      } catch {
        break; // EOF or readline closed
      }
      const line = raw.trim();
      if (!line) continue;
      if (line === "exit" || line === "quit") break;

      if (line.startsWith("/")) {
        const [cmdName, ...argParts] = line.slice(1).split(/\s+/);
        const cmd = commandMap.get(cmdName);
        if (!cmd) {
          renderer.renderError(`Unknown command: /${cmdName}. Type /help`);
          continue;
        }
        await cmd.execute(argParts.join(" "), deps);
        continue;
      }

      process.stdout.write(`${MAGENTA}agent ›${RESET} `);
      try {
        await agent.prompt(line);
      } catch (err) {
        renderer.renderError(err instanceof Error ? err.message : String(err));
      }
      process.stdout.write("\n\n");
    }
  } finally {
    rl.close();
  }
}

export async function promptPermission(toolName: string, preview: string): Promise<{
  decision: "allow" | "deny";
  rememberForSession: boolean;
}> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(`\n${YELLOW}┌─ Permission ─────────────────────────────${RESET}\n`);
    process.stdout.write(`${YELLOW}│${RESET} Tool: ${BOLD}${toolName}${RESET}\n`);
    for (const line of preview.split("\n")) {
      process.stdout.write(`${YELLOW}│${RESET} ${line}\n`);
    }
    process.stdout.write(`${YELLOW}└───────────────────────────────────────────${RESET}\n`);
    const answer = await rl.question(`  [${GREEN}Y${RESET}]es  [${colors.RED}N${RESET}]o  [${colors.CYAN}A${RESET}]lways > `);
    const key = answer.trim().toLowerCase();

    switch (key) {
      case "a": case "always":
        return { decision: "allow", rememberForSession: true };
      case "n": case "no":
        return { decision: "deny", rememberForSession: false };
      default:
        return { decision: "allow", rememberForSession: false };
    }
  } finally {
    rl.close();
  }
}
