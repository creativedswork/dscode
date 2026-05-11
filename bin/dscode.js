#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader = require.resolve("tsx/esm");
const main = resolve(pkgRoot, "src", "core", "main.ts");

const child = spawn(process.execPath, ["--import", tsxLoader, main], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (err) => {
  console.error("Failed to start dscode:", err.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));