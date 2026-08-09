import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageVersion = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version;

describe("dscode version flag", () => {
  it("prints the package version for --version", () => {
    const configHome = mkdtempSync(join(tmpdir(), "dscode-version-"));
    writeFileSync(join(configHome, "config.json"), "{}\n", "utf8");

    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", resolve(repoRoot, "src/core/main.ts"), "--version"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DSCODE_CONFIG_HOME: configHome,
          DSCODE_DATA_HOME: configHome,
        },
        encoding: "utf8",
      },
    );

    expect(output.trim()).toBe(packageVersion);
  }, 15_000);

  it("prints the package version for -v", () => {
    const configHome = mkdtempSync(join(tmpdir(), "dscode-version-"));
    writeFileSync(join(configHome, "config.json"), "{}\n", "utf8");

    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", resolve(repoRoot, "src/core/main.ts"), "-v"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          DSCODE_CONFIG_HOME: configHome,
          DSCODE_DATA_HOME: configHome,
        },
        encoding: "utf8",
      },
    );

    expect(output.trim()).toBe(packageVersion);
  }, 15_000);
});
