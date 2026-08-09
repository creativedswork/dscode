import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { cp, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const buildDir = "release/package";
const REQUIRED_AGENT_APPS = [
  "chief-attribution",
  "chief-backtrack",
  "chief-graph",
  "chief-oracle",
  "eval-rule-attribution",
  "eval-rule-merge",
  "general",
  "vision",
];

function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

async function validateBundledAgent(name, content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]+)$/);
  if (!match) throw new Error(`Invalid Agent Application markdown: ${name}.md`);
  const attributes = parse(match[1]);
  if (attributes?.name !== name) {
    throw new Error(`Bundled Agent Application name mismatch in ${name}.md`);
  }
  if (!match[2].trim()) throw new Error(`Bundled Agent Application has no prompt: ${name}.md`);
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(resolve(directory, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

async function buildResources(packageJson) {
  const sourceRoot = resolve(rootDir, "resources");
  const outputRoot = resolve(rootDir, "dist", "resources");
  const catalogPath = resolve(sourceRoot, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (catalog.schemaVersion !== 1 || !catalog.entries) {
    throw new Error("Invalid resources/catalog.json");
  }
  if (existsSync(outputRoot)) rmSync(outputRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  const entries = {};
  const bundledAgentNames = new Set();
  for (const [id, entry] of Object.entries(catalog.entries)) {
    const source = resolve(sourceRoot, entry.source);
    const destination = resolve(outputRoot, entry.path);
    if (!isWithin(sourceRoot, source) || !isWithin(outputRoot, destination)) {
      throw new Error(`Resource escapes root: ${id}`);
    }
    if (!existsSync(source)) {
      if (entry.required) throw new Error(`Missing required resource: ${id}`);
      continue;
    }
    const content = await readFile(source);
    if (id.startsWith("agent:")) {
      const name = id.slice("agent:".length);
      await validateBundledAgent(name, content.toString("utf8"));
      bundledAgentNames.add(name);
    }
    mkdirSync(dirname(destination), { recursive: true });
    await cp(source, destination);
    entries[id] = {
      path: entry.path,
      mediaType: entry.mediaType,
      required: Boolean(entry.required),
      sha256: digest(content),
    };
  }
  for (const name of REQUIRED_AGENT_APPS) {
    if (!bundledAgentNames.has(name)) {
      throw new Error(`Missing bundled Agent Application: ${name}`);
    }
  }

  const webSource = resolve(rootDir, "dist", "web");
  if (existsSync(webSource)) {
    const webDestination = resolve(outputRoot, "web");
    await cp(webSource, webDestination, { recursive: true });
    for (const relative of await listFiles(webDestination)) {
      const content = await readFile(resolve(webDestination, relative));
      entries[`web:${relative}`] = {
        path: `web/${relative}`,
        mediaType: relative.endsWith(".html")
          ? "text/html"
          : relative.endsWith(".css")
          ? "text/css"
          : relative.endsWith(".js")
          ? "text/javascript"
          : "application/octet-stream",
        required: true,
        sha256: digest(content),
      };
    }
    rmSync(webSource, { recursive: true });
  }

  await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    entries,
  }, null, 2)}\n`);
}

async function main() {
  // Step 1: enforce dependency boundaries
  console.log("Architecture check...");
  execSync("npm run architecture:check", { stdio: "inherit", cwd: rootDir });

  // Step 2: typecheck
  console.log("Typecheck...");
  execSync("npx tsc --noEmit", { stdio: "inherit", cwd: rootDir });

  // Step 3: esbuild
  console.log("Building...");
  const distDir = resolve(rootDir, "dist");
  if (existsSync(distDir)) rmSync(distDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });
  const outfile = resolve(rootDir, "dist", "dscode.mjs");
  await esbuild.build({
    entryPoints: [resolve(rootDir, "src", "core", "main.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile,
    banner: { js: "#!/usr/bin/env node" },
    external: [
      "@earendil-works/*",
      "@mariozechner/*",
      "chalk",
      "tesseract.js",
      "ws",
      "sharp",
      "pngjs",
      "jpeg-js",
      "yaml",
      "typebox",
      "typebox/*",
    ],
    sourcemap: false,
    minify: false,
    logLevel: "info",
  });
  chmodSync(outfile, 0o755);

  // Step 4: build web frontend
  const webDir = resolve(rootDir, "web");
  if (existsSync(webDir)) {
    console.log("Building web UI...");
    execSync("npm install", { stdio: "inherit", cwd: webDir });
    execSync("npm run build", { stdio: "inherit", cwd: webDir });
  }

  // Step 5: validate and assemble runtime resources
  console.log("Building runtime resources...");
  const packageJson = JSON.parse(await readFile(resolve(rootDir, "package.json"), "utf8"));
  await buildResources(packageJson);

  // Step 6: assemble the only publishable package staging directory
  console.log("Assembling %s/...", buildDir);
  const standalone = resolve(rootDir, buildDir);
  if (existsSync(standalone)) rmSync(standalone, { recursive: true });
  mkdirSync(resolve(standalone, "dist"), { recursive: true });

  await cp(resolve(rootDir, "dist"), resolve(standalone, "dist"), { recursive: true });

  delete packageJson.scripts;
  delete packageJson.devDependencies;
  delete packageJson.private;
  packageJson.files = ["dist/**", "README.md", "LICENSE"];
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
