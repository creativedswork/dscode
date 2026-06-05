import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, PROVIDER_ENV_VARS } from "./config.js";
import { Harness } from "./harness.js";

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
  console.error("[unhandledRejection]", reason);
  emergencySaveSession();
});

process.on("uncaughtException", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("\n  \u26a0 " + msg + "\n");
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
    console.log("\nShutting down... (press Ctrl+C again to force quit)");
    emergencySaveSession();
    // Let the normal shutdown flow handle the rest
  } else {
    console.log("\nForce quitting...");
    emergencySaveSession();
    process.exit(0);
  }
});

process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down...");
  emergencySaveSession();
  process.exit(0);
});

// ── CLI ──

function isDevMode(): boolean {
  const url = import.meta.url;
  return url.includes("/src/core/main.ts");
}

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

function parseArgs(): { web: boolean; webPort: number; debug: boolean } {
  const args = process.argv.slice(2);
  const dev = isDevMode();
  let web = false;
  let webPort = 3000;
  let debug = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--web") {
      web = true;
    } else if (args[i] === "--debug" && dev) {
      debug = true;
    } else if (args[i] === "--web-port" && i + 1 < args.length) {
      webPort = parseInt(args[++i], 10);
      if (isNaN(webPort) || webPort < 1 || webPort > 65535) {
        console.error(`Invalid port: ${args[i]}. Using default 3000.`);
        webPort = 3000;
      }
    }
  }

  return { web, webPort, debug };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg === "--version" || arg === "-v")) {
    console.log(readCliVersion());
    return;
  }

  const { web, webPort, debug } = parseArgs();
  const config = loadConfig();

  if (config.apiKey) {
    const envVar = PROVIDER_ENV_VARS[config.provider] ?? "DEEPSEEK_API_KEY";
    process.env[envVar] = config.apiKey;
    if (envVar !== "DEEPSEEK_API_KEY") {
      process.env.DEEPSEEK_API_KEY = config.apiKey;
    }
  }

  const harness = new Harness(config, debug);
  harnessRef = harness;
  await harness.initialize();

  if (web) {
    // Web mode: create WebUiBackend with HTTP + WebSocket server
    const { WebUiBackend } = await import("../ui/web/web-backend.js");
    const webUi = new WebUiBackend({
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
  console.error(err);
  emergencySaveSession();
  process.exit(1);
});
