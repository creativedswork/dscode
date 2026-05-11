import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const buildDir = "dist-standalone";

async function main() {
  // Step 1: typecheck
  console.log("Typecheck...");
  execSync("npx tsc --noEmit", { stdio: "inherit", cwd: rootDir });

  // Step 2: esbuild
  console.log("Building...");
  const outfile = resolve(rootDir, "dist", "dscode.mjs");
  await esbuild.build({
    entryPoints: [resolve(rootDir, "src", "core", "main.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile,
    banner: { js: "#!/usr/bin/env node" },
    external: ["@earendil-works/*", "@mariozechner/*", "chalk", "tesseract.js"],
    sourcemap: false,
    minify: false,
    logLevel: "info",
  });
  chmodSync(outfile, 0o755);

  // Step 3: assemble dist-standalone/
  console.log("Assembling %s/...", buildDir);
  const standalone = resolve(rootDir, buildDir);
  if (existsSync(standalone)) rmSync(standalone, { recursive: true });
  mkdirSync(resolve(standalone, "dist"), { recursive: true });

  await cp(resolve(rootDir, "dist"), resolve(standalone, "dist"), { recursive: true });
  await cp(resolve(rootDir, "package.json"), resolve(standalone, "package.json"));
  await cp(resolve(rootDir, "README.md"), resolve(standalone, "README.md"));

  const license = resolve(rootDir, "LICENSE");
  if (existsSync(license)) await cp(license, resolve(standalone, "LICENSE"));

  console.log("Build complete: %s/", buildDir);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});