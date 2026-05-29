// Check that package-lock.json doesn't leak private registry URLs
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lockfilePath = resolve(__dirname, "..", "package-lock.json");
const lockfile = readFileSync(lockfilePath, "utf8");

const PRIVATE_REGISTRIES = [
  "bnpm.byted.org",
  // add other private registries here if needed
];

const found = PRIVATE_REGISTRIES.filter((reg) => lockfile.includes(reg));

if (found.length > 0) {
  console.error(
    `❌ LOCKFILE CHECK FAILED: package-lock.json contains private registry URLs:\n` +
      `   ${found.join(", ")}\n` +
      `\n` +
      `   Fix: ensure project .npmrc has 'registry=https://registry.npmjs.org',\n` +
      `   then run: rm -rf node_modules package-lock.json && npm install\n`
  );
  process.exit(1);
}

console.log("✅ lockfile:check passed — all packages use public registry");
