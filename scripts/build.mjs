import { execSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { cp, readFile, writeFile } from "node:fs/promises";
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
    external: ["@earendil-works/*", "@mariozechner/*", "chalk", "tesseract.js", "ws"],
    sourcemap: false,
    minify: false,
    logLevel: "info",
  });
  chmodSync(outfile, 0o755);

  // Step 3: build web frontend
  const webDir = resolve(rootDir, "web");
  if (existsSync(webDir)) {
    console.log("Building web UI...");
    execSync("npm run build", { stdio: "inherit", cwd: webDir });
  }

  // Step 4: copy static assets
  console.log("Copying sandbox.html and MDX runtime...");
  await cp(
    resolve(rootDir, "src", "mcp", "app", "sandbox.html"),
    resolve(rootDir, "dist", "sandbox.html"),
  );
  const mdxRuntimeDest = resolve(rootDir, "dist", "mdx-runtime.js");
  const mdxRuntimeSrc = resolve(rootDir, "src", "ui", "mdx", "mdx-runtime.js");
  if (existsSync(mdxRuntimeSrc)) {
    await cp(mdxRuntimeSrc, mdxRuntimeDest);
  }

  // Step 5: assemble dist-standalone/
  console.log("Assembling %s/...", buildDir);
  const standalone = resolve(rootDir, buildDir);
  if (existsSync(standalone)) rmSync(standalone, { recursive: true });
  mkdirSync(resolve(standalone, "dist"), { recursive: true });

  await cp(resolve(rootDir, "dist"), resolve(standalone, "dist"), { recursive: true });

  // Copy web frontend if exists
  const webDist = resolve(rootDir, "dist", "web");
  if (existsSync(webDist)) {
    await cp(webDist, resolve(standalone, "dist", "web"), { recursive: true });
  }

  const packageJson = JSON.parse(await readFile(resolve(rootDir, "package.json"), "utf8"));
  delete packageJson.scripts;
  delete packageJson.devDependencies;
  await writeFile(resolve(standalone, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);

  await cp(resolve(rootDir, "README.md"), resolve(standalone, "README.md"));

  const license = resolve(rootDir, "LICENSE");
  if (existsSync(license)) await cp(license, resolve(standalone, "LICENSE"));

  console.log("Build complete: %s/", buildDir);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});