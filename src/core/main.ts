import { loadConfig } from "./config.js";
import { Harness } from "./harness.js";

// Prevent unhandled rejections from crashing the process
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

async function main(): Promise<void> {
  const config = loadConfig();

  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("Missing DEEPSEEK_API_KEY. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const harness = new Harness(config);
  await harness.initialize();
  await harness.run();
  process.exit(0);
}

main();
