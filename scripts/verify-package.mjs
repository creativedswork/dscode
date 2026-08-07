import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (!tarball) {
  throw new Error("Usage: node scripts/verify-package.mjs <package.tgz>");
}

const MAX_PACKED_BYTES = 5 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 20 * 1024 * 1024;
const packedBytes = statSync(tarball).size;
if (packedBytes > MAX_PACKED_BYTES) {
  throw new Error(`Package exceeds packed size limit: ${packedBytes}`);
}

const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);
const forbidden = files.filter((path) =>
  /(^|\/)(src|tests|screen_shots|\.dscode|\.claude|\.env)(\/|$)/.test(path),
);
if (forbidden.length > 0) {
  throw new Error(`Package contains forbidden files: ${forbidden.join(", ")}`);
}
for (const required of [
  "package/package.json",
  "package/dist/dscode.mjs",
  "package/dist/resources/manifest.json",
  "package/dist/resources/agents/chief-attribution.md",
  "package/dist/resources/agents/chief-backtrack.md",
  "package/dist/resources/agents/chief-graph.md",
  "package/dist/resources/agents/chief-oracle.md",
  "package/dist/resources/agents/eval-rule-attribution.md",
  "package/dist/resources/agents/eval-rule-merge.md",
  "package/dist/resources/agents/general.md",
  "package/dist/resources/agents/vision.md",
]) {
  if (!files.includes(required)) throw new Error(`Package is missing ${required}`);
}

const extraction = mkdtempSync(join(tmpdir(), "dscode-package-"));
try {
  execFileSync("tar", ["-xzf", tarball, "-C", extraction]);
  const packageRoot = join(extraction, "package");
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "dist", "resources", "manifest.json"), "utf8"),
  );
  if (packageJson.private) throw new Error("Release package must not be private");
  if (packageJson.version !== manifest.packageVersion) {
    throw new Error("Release package and resource manifest versions differ");
  }
  const tag = process.env.GITHUB_REF_NAME;
  if (tag?.startsWith("v") && tag.slice(1) !== packageJson.version) {
    throw new Error(`Git tag ${tag} does not match package version ${packageJson.version}`);
  }

  let unpackedBytes = 0;
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else unpackedBytes += statSync(path).size;
    }
  };
  visit(packageRoot);
  if (unpackedBytes > MAX_UNPACKED_BYTES) {
    throw new Error(`Package exceeds unpacked size limit: ${unpackedBytes}`);
  }

  for (const [id, entry] of Object.entries(manifest.entries)) {
    const path = resolve(packageRoot, "dist", "resources", entry.path);
    const content = readFileSync(path);
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== entry.sha256) throw new Error(`Resource digest mismatch: ${id}`);
  }

  const smokeCwd = mkdtempSync(join(tmpdir(), "dscode-package-cwd-"));
  try {
    execFileSync("npm", ["init", "--yes"], { cwd: smokeCwd, stdio: "ignore" });
    execFileSync("npm", [
      "install",
      "--ignore-scripts",
      "--omit=optional",
      tarball,
    ], { cwd: smokeCwd, stdio: "inherit" });
    const installed = join(
      smokeCwd,
      "node_modules",
      "@creative-dswork",
      "dscode",
    );
    const cli = join(installed, "dist", "dscode.mjs");
    execFileSync(process.execPath, [cli, "--version"], { cwd: smokeCwd, stdio: "inherit" });
    execFileSync(process.execPath, [cli, "--check-resources"], {
      cwd: smokeCwd,
      stdio: "inherit",
    });
  } finally {
    rmSync(smokeCwd, { recursive: true, force: true });
  }

  console.log(`Package verified: ${tarball} (${packedBytes} packed, ${unpackedBytes} unpacked)`);
} finally {
  rmSync(extraction, { recursive: true, force: true });
}
