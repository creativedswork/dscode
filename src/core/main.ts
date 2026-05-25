import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "./config.js";
import { Harness } from "./harness.js";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

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

function parseArgs(): { web: boolean; webPort: number } {
  const args = process.argv.slice(2);
  let web = false;
  let webPort = 3000;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--web") {
      web = true;
    } else if (args[i] === "--web-port" && i + 1 < args.length) {
      webPort = parseInt(args[++i], 10);
      if (isNaN(webPort) || webPort < 1 || webPort > 65535) {
        console.error(`Invalid port: ${args[i]}. Using default 3000.`);
        webPort = 3000;
      }
    }
  }

  return { web, webPort };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg === "--version" || arg === "-v")) {
    console.log(readCliVersion());
    return;
  }

  const { web, webPort } = parseArgs();
  const config = loadConfig();

  if (config.apiKey) {
    process.env.DEEPSEEK_API_KEY = config.apiKey;
  }

  const harness = new Harness(config);
  await harness.initialize();

  if (web) {
    // Web mode: create WebUiBackend with HTTP + WebSocket server
    const { WebUiBackend } = await import("../ui/web/web-backend.js");
    const webUi = new WebUiBackend({
      port: webPort,
      harness,
      config,
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
  process.exit(1);
});
