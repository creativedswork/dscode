import { createInterface } from "node:readline/promises";

import type { Agent } from "@mariozechner/pi-agent-core";

import type { Harness } from "../core/harness.js";
import type { SessionManager } from "../session/manager.js";
import type { MemoryManager } from "../memory/manager.js";
import type { DriverRegistry } from "../drivers/registry.js";
import type { SkillManager } from "../skills/manager.js";
import type { PermissionManager } from "../permissions/manager.js";
import type { ContextManager } from "../context/manager.js";
import { TerminalRenderer, colors, randomTip } from "./render.js";
import { COMMANDS } from "./commands.js";

const { DIM, GREEN, MAGENTA, BOLD, RESET, YELLOW, CYAN } = colors;

const MAX_AUTO_CONTINUE = 3;




interface ReplDeps {
  agent: Agent;
  harness: Harness;
  sessionManager: SessionManager;
  memoryManager: MemoryManager;
  driverRegistry: DriverRegistry;
  skillManager: SkillManager;
  permissionManager: PermissionManager;
  contextManager: ContextManager;
  renderer: TerminalRenderer;
  modelName: string;
}

export async function runRepl(deps: ReplDeps): Promise<void> {
  const { agent, renderer, modelName } = deps;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  replReadline = rl;

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

  // Tab key handling: abort streaming and return to prompt
  const stdin = process.stdin;
  if (stdin.isTTY) {
    stdin.setRawMode?.(true);
    stdin.on("data", (data: Buffer) => {
      // Tab key = 0x09
      if (data.length === 1 && data[0] === 0x09 && agent.state.isStreaming) {
        agent.abort();
        renderer.renderInfo("\n(aborted)");
      }
    });
    stdin.setRawMode?.(false);
  }

  try {
    while (true) {
      let raw: string;
      try {
        console.log(`${DIM}${randomTip()}${RESET}`);
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
        deps.harness.startSpinner();
        await agent.prompt(line);
        deps.harness.stopSpinner();
        // auto-continue on truncation
        let retries = 0;
        while (deps.harness.wasTruncated && retries < MAX_AUTO_CONTINUE) {
          retries++;
          deps.harness.resetTruncated();
          renderer.renderInfo(`\n⚠ Output truncated (hit max_tokens). Auto-continuing (${retries}/${MAX_AUTO_CONTINUE})...`);
          process.stdout.write(`${MAGENTA}agent ›${RESET} `);
          deps.harness.startSpinner();
          await agent.prompt("Continue from where you left off. Do not repeat what was already said.");
          deps.harness.stopSpinner();
        }
        if (deps.harness.wasTruncated) {
          deps.harness.resetTruncated();
          renderer.renderInfo(`\n⚠ Output still truncated after ${MAX_AUTO_CONTINUE} retries. Consider increasing DSCODE_MAX_TOKENS.`);
        }
      } catch (err) {
        deps.harness.stopSpinner();
        renderer.renderError(err instanceof Error ? err.message : String(err));
      }
      process.stdout.write("\n\n");
    }
  } finally {
    rl.close();
  }

}

// Module-level reference to the REPL readline interface, set by runRepl.
// Used by promptPermission to pause/resume readline during raw mode input.
let replReadline: ReturnType<typeof createInterface> | null = null;

export async function promptPermission(toolName: string, preview: string): Promise<{
  decision: "allow" | "deny";
  rememberForSession: boolean;
}> {
  process.stdout.write(`\n${YELLOW}┌─ Permission ─────────────────────────────${RESET}\n`);
  process.stdout.write(`${YELLOW}│${RESET} Tool: ${BOLD}${toolName}${RESET}\n`);
  for (const line of preview.split("\n")) {
    process.stdout.write(`${YELLOW}│${RESET} ${line}\n`);
  }
  process.stdout.write(`${YELLOW}└───────────────────────────────────────────${RESET}\n`);

  // Use the REPL readline to ask for confirmation (Y/N/A + Enter).
  // This avoids raw mode stdin conflicts and prevents accidental input.
  const rl = replReadline;
  if (rl) {
    while (true) {
      const answer = (await rl.question(`  [${GREEN}Y${RESET}]es  [${colors.RED}N${RESET}]o  [${colors.CYAN}A${RESET}]lways > `)).trim().toLowerCase();
      if (answer === "y") {
        return { decision: "allow", rememberForSession: false };
      }
      if (answer === "n") {
        return { decision: "deny", rememberForSession: false };
      }
      if (answer === "a") {
        return { decision: "allow", rememberForSession: true };
      }
      // Invalid input, prompt again
      process.stdout.write(`  ${YELLOW}(enter Y, N, or A)${RESET}\n`);
    }
  }

  // Fallback: no readline available, use raw mode
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const isRaw = stdin.isRaw;
    const resume = stdin.isPaused();

    if (resume) stdin.resume();
    stdin.setRawMode?.(true);
    stdin.setEncoding("utf8");

    let handled = false;
    const onData = (data: string) => {
      if (handled) return;
      handled = true;

      const key = data.trim().toLowerCase()[0] ?? "";
      stdin.removeListener("data", onData);
      stdin.setRawMode?.(isRaw ? true : false);
      if (resume) stdin.pause();

      process.stdout.write(">\n");

      switch (key) {
        case "a":
          resolve({ decision: "allow", rememberForSession: true });
          break;
        case "n":
          resolve({ decision: "deny", rememberForSession: false });
          break;
        default:
          resolve({ decision: "allow", rememberForSession: false });
          break;
      }
    };

    stdin.on("data", onData);
  });
}
