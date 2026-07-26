import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

import { loadConfig, PROVIDER_ENV_VARS } from "./config.js";
import { Harness } from "./harness.js";
import { Logger } from "../utils/logger.js";
import { ensureOdMcpEntry, expandTilde, startOdDaemon, waitForOdDaemon, registerOdCleanup } from "./od-daemon.js";

// ── Runtime ID ──

function generateRuntimeId(): string {
  return "rt_" + randomBytes(4).toString("hex");
}

const runtimeId = generateRuntimeId();
process.env.DSCODE_RUNTIME_ID = runtimeId;

const harnessLogger = new Logger({ type: "harness", id: runtimeId });

// ── Crash-resilience: attempt to save session on fatal events ──

let harnessRef: Harness | null = null;

function emergencySaveSession(): void {
  if (harnessRef) {
    try {
      harnessRef.saveSessionNow();
    } catch {
      // Last-resort save, suppress all errors
    }
  }
}

process.on("unhandledRejection", (reason) => {
  harnessLogger.error("UnhandledRejection", String(reason));
  emergencySaveSession();
});

process.on("uncaughtException", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  harnessLogger.error("UncaughtException", msg);
  emergencySaveSession();
  // Give I/O a brief moment to flush, then exit
  setTimeout(() => {
    process.exit(1);
  }, 500).unref();
})

// ── Signal handlers for graceful shutdown ──

let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount === 1) {
    harnessLogger.info("SIGINT", "Shutting down... (press Ctrl+C again to force quit)");
    emergencySaveSession();
    // Let the normal shutdown flow handle the rest
  } else {
    harnessLogger.info("SIGINT", "Force quitting...");
    emergencySaveSession();
    process.exit(0);
  }
});

process.on("SIGTERM", () => {
  harnessLogger.info("SIGTERM", "Received SIGTERM, shutting down...");
  emergencySaveSession();
  process.exit(0);
});

// ── CLI ──

function readCliVersion(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(currentDir, "..", "package.json"),
    join(currentDir, "..", "..", "package.json"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version.trim() !== "") {
      return pkg.version;
    }
  }

  return "unknown";
}

function parseArgs(): { web: boolean; webPort: number; debug: boolean; cwd?: string; withOd: boolean } {
  const args = process.argv.slice(2);
  let web = false;
  let webPort = 3000;
  let debug = false;
  let cwd: string | undefined;
  let withOd = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--web") {
      web = true;
    } else if (args[i] === "--debug") {
      debug = true;
    } else if (args[i] === "--with-od") {
      withOd = true;
    } else if (args[i] === "--web-port" && i + 1 < args.length) {
      webPort = parseInt(args[++i], 10);
      if (isNaN(webPort) || webPort < 1 || webPort > 65535) {
        webPort = 3000;
      }
    } else if (args[i] === "--cwd" && i + 1 < args.length) {
      cwd = resolve(args[++i]);
    }
  }

  return { web, webPort, debug, cwd, withOd };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg === "--version" || arg === "-v")) {
    console.log(readCliVersion());
    return;
  }

  const { web, webPort, debug, cwd, withOd } = parseArgs();
  const projectRoot = process.cwd();  // capture before loadConfig may chdir

  // ── Open Design daemon auto-start ──
  if (withOd) {
    const odDir = process.env.OPEN_DESIGN_DIR;
    const odPort = parseInt(process.env.OD_PORT ?? "7456", 10);

    if (!odDir) {
      console.warn("OPEN_DESIGN_DIR is not set. Create a .env file from .env.example");
    } else {
      // Step 1: ensure ~/.mcp.json has the open-design MCP entry
      ensureOdMcpEntry(odDir, odPort);

      // Step 1.5: quick health check — skip spawn if daemon already running
      const alreadyAlive = await waitForOdDaemon(odPort, 2000);

      if (!alreadyAlive) {
        // Step 2: spawn the daemon child process
        try {
          const odChild = startOdDaemon(odDir, odPort);

          // Step 3: register cleanup handler for graceful shutdown
          registerOdCleanup(odChild);

          // Step 4: monitor child process exit
          odChild.on("exit", (code, signal) => {
            if (signal) {
              harnessLogger.info("ODDaemon", `Open Design daemon killed by signal ${signal}`);
            } else if (code !== 0 && code !== null) {
              harnessLogger.info("ODDaemon", `Open Design daemon exited with code ${code}`);
            }
          });

          // Handle spawn errors (e.g., command not found, directory missing)
          odChild.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
              const expandedDir = expandTilde(odDir);
              if (!existsSync(expandedDir)) {
                console.warn(
                  `Open Design directory not found: ${expandedDir}. Check OPEN_DESIGN_DIR in .env`,
                );
              } else {
                console.warn(
                  `Cannot start Open Design daemon: command not found. ` +
                  `Install pnpm (https://pnpm.io/installation) or run \`cd ${expandedDir} && pnpm link --global\` for the global od command.`,
                );
              }
            } else {
              harnessLogger.warn("ODDaemon", `Open Design daemon error: ${err.message}`);
            }
          });

          // Step 5: wait for daemon health check
          await waitForOdDaemon(odPort);
        } catch (e) {
          harnessLogger.warn(
            "ODDaemon",
            `Failed to start Open Design daemon: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }
  }

  const config = loadConfig(cwd);

  if (config.apiKey) {
    const envVar = PROVIDER_ENV_VARS[config.provider] ?? "DEEPSEEK_API_KEY";
    process.env[envVar] = config.apiKey;
    if (envVar !== "DEEPSEEK_API_KEY") {
      process.env.DEEPSEEK_API_KEY = config.apiKey;
    }
  }

  const harness = new Harness(config, harnessLogger, debug);
  harnessRef = harness;
  await harness.initialize();

  if (web) {
    // Web mode: create WebUiBackend with HTTP + WebSocket server
    const { WebUiBackend } = await import("../ui/web/web-backend.js");
    const webUi = new WebUiBackend({
      projectRoot,
      port: webPort,
      harness,
      config,
      configStore: harness.configStore,
    });
    // Pass AppHostManager to web backend so MCP apps can be served
    if (harness.appHostManager) {
      webUi.setAppHostManager(harness.appHostManager);
    }
    await harness.run(webUi);
  } else {
    // CLI mode: default TuiBackend
    await harness.run();
  }
}

main().catch((err) => {
  harnessLogger.error("FatalStartup", err instanceof Error ? err.message : String(err));
  emergencySaveSession();
  process.exit(1);
});
