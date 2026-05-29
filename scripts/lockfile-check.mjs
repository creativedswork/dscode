// Check that package-lock.json files don't leak private registry URLs
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCKFILES = [
  resolve(__dirname, "..", "package-lock.json"),
  resolve(__dirname, "..", "web", "package-lock.json"),
];

const PRIVATE_REGISTRIES = [
  "bnpm.byted.org",
  // add other private registries here if needed
];

let fail = false;
for (const lockfilePath of LOCKFILES) {
  const lockfile = readFileSync(lockfilePath, "utf8");
  const found = PRIVATE_REGISTRIES.filter((reg) => lockfile.includes(reg));

  if (found.length > 0) {
    console.error(
      `❌ ${lockfilePath} contains private registry URLs:\n` +
        `   ${found.join(", ")}`
    );
    fail = true;
  }
}

if (fail) {
  console.error(
    `\n   Fix: ensure .npmrc has 'registry=https://registry.npmjs.org',\n` +
      `   then run: rm -rf node_modules package-lock.json && npm install\n`
  );
  process.exit(1);
}

console.log("✅ lockfile:check passed — all lockfiles use public registry");
