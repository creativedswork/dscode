import { loadConfig } from "./config.js";
import { Harness } from "./harness.js";

const config = loadConfig();

if (!process.env.DEEPSEEK_API_KEY) {
  console.error("Missing DEEPSEEK_API_KEY. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const harness = new Harness(config);
harness.initialize();
await harness.run();
