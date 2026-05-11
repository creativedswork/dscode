import { loadConfig } from "./config.js";
import { Harness } from "./harness.js";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.apiKey) {
    process.env.DEEPSEEK_API_KEY = config.apiKey;
  }

  const harness = new Harness(config);
  await harness.initialize();
  await harness.run();
  process.exit(0);
}

main();