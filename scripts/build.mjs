import * as esbuild from "esbuild";
import { chmodSync } from "node:fs";

const outfile = "dist/dscode.mjs";

await esbuild.build({
  entryPoints: ["src/core/main.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile,
  banner: {
    js: "#!/usr/bin/env node",
  },
  external: [
    // Runtime dependencies — keep as external imports
    "@earendil-works/*",
    "@mariozechner/*",
    "chalk",
    "tesseract.js",
  ],
  sourcemap: false,
  minify: false,
  logLevel: "info",
});

chmodSync(outfile, 0o755);
console.log("Build complete: %s (executable)", outfile);