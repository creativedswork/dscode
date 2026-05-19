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

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg === "--version" || arg === "-v")) {
    console.log(readCliVersion());
    return;
  }

  const config = loadConfig();

  if (config.apiKey) {
    process.env.DEEPSEEK_API_KEY = config.apiKey;
  }

  const harness = new Harness(config);
  await harness.initialize();
  await harness.run();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
