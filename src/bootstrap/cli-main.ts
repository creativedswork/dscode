import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";

import { loadConfig } from "../config/loader.js";
import {
  createStandardAgentHost,
  type StandardAgentHost,
} from "./create-standard-agent-host.js";
import { Logger } from "../kernel/logger.js";
import { PackageResourceProvider } from "../agents/definitions/package-resources.js";
import type { IntegrationRuntimeOverride } from "../integrations/open-design/types.js";
import type { UiBackend } from "../ui/backend.js";
import { resolveBuiltResource } from "../resources/runtime.js";

// ── Runtime ID ──

function generateRuntimeId(): string {
  return "rt_" + randomBytes(4).toString("hex");
}

const runtimeId = generateRuntimeId();

const harnessLogger = new Logger({ type: "harness", id: runtimeId });

// ── Crash-resilience: attempt to save session on fatal events ──

let activeHost: StandardAgentHost | null = null;
let activeUi: UiBackend | null = null;
let hostShutdownRef: (() => Promise<void>) | null = null;

function emergencySaveSession(): void {
  if (activeHost) {
    try {
      activeHost.save();
    } catch {
      // Last-resort save, suppress all errors
    }
  }
}

function shutdownHost(): Promise<void> {
  return hostShutdownRef?.() ?? Promise.resolve();
}

process.on("unhandledRejection", (reason) => {
  harnessLogger.error("UnhandledRejection", String(reason));
  emergencySaveSession();
});

process.on("uncaughtException", (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  harnessLogger.error("UncaughtException", msg);
  emergencySaveSession();
  const forceExit = setTimeout(() => {
    process.exit(1);
  }, 500).unref();
  void shutdownHost().finally(() => {
    clearTimeout(forceExit);
    process.exit(1);
  });
});

// ── Signal handlers for graceful shutdown ──

let sigintCount = 0;
process.on("SIGINT", () => {
  sigintCount++;
  if (sigintCount === 1) {
    harnessLogger.info("SIGINT", "Shutting down... (press Ctrl+C again to force quit)");
    emergencySaveSession();
    activeUi?.handleInterrupt?.();
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
  void shutdownHost().finally(() => process.exit(0));
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

interface CliArgs {
  web: boolean;
  webPort: number;
  debug: boolean;
  cwd?: string;
  integrationOverrides: IntegrationRuntimeOverride[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let web = false;
  let webPort = 3000;
  let debug = false;
  let cwd: string | undefined;
  const integrationOverrides: IntegrationRuntimeOverride[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--web") {
      web = true;
    } else if (args[i] === "--debug") {
      debug = true;
    } else if (args[i] === "--with-od") {
      integrationOverrides.push({
        id: "open-design",
        enabled: true,
        autoStart: true,
      });
    } else if (args[i] === "--web-port" && i + 1 < args.length) {
      webPort = parseInt(args[++i], 10);
      if (isNaN(webPort) || webPort < 1 || webPort > 65535) {
        webPort = 3000;
      }
    } else if (args[i] === "--cwd" && i + 1 < args.length) {
      cwd = resolve(args[++i]);
    }
  }

  return { web, webPort, debug, cwd, integrationOverrides };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg === "--version" || arg === "-v")) {
    console.log(readCliVersion());
    return;
  }
  if (process.argv.slice(2).includes("--check-resources")) {
    const documents = await new PackageResourceProvider().load();
    console.log(`Resources OK: ${documents.map((item) => item.source.path).join(", ")}`);
    return;
  }

  const { web, webPort, debug, cwd, integrationOverrides } = parseArgs();
  const projectRoot = process.cwd();
  const environment = Object.freeze({ ...process.env });
  const homeDirectory = homedir();
  const baseConfig = loadConfig(cwd, {
    environment,
    currentWorkingDirectory: projectRoot,
    userMcpFile: join(homeDirectory, ".mcp.json"),
  });

  const host = await createStandardAgentHost({
    config: baseConfig,
    logger: harnessLogger,
    debug,
    environment,
    homeDirectory,
    integrationOverrides,
  });
  activeHost = host;
  hostShutdownRef = host.shutdown;
  await host.initialize();

  let ui: UiBackend;
  if (web) {
    const { WebUiBackend } = await import("../ui/web/web-backend.js");
    const webUi = new WebUiBackend({
      projectRoot,
      port: webPort,
      harness: host.api,
      webRoot: resolveBuiltResource("web"),
    });
    const appResourceProxy = host.appResourceProxy();
    if (appResourceProxy) {
      webUi.setAppResourceProxy(appResourceProxy);
    }
    ui = webUi;
  } else {
    const { TuiBackend } = await import("../ui/tui/backend.js");
    ui = new TuiBackend(host.api);
  }

  host.bindUserInteraction({
    requestPermission: ui.getPromptPermission(),
  });
  activeUi = ui;
  await ui.start();
  try {
    await host.start();
    await ui.waitForExit();
  } finally {
    await ui.shutdown();
    await host.shutdown();
    activeHost = null;
    activeUi = null;
    hostShutdownRef = null;
  }
}

main().catch((err) => {
  harnessLogger.error("FatalStartup", err instanceof Error ? err.message : String(err));
  emergencySaveSession();
  process.exit(1);
});
