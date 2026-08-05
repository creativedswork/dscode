import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { writeDashboardArtifacts } from "../../src/eval/dashboard.js";

describe("Eval Dashboard artifact persistence", () => {
  it("atomically writes the exact same HTML to run and compatibility paths", () => {
    const root = mkdtempSync(join(tmpdir(), "eval-dashboard-"));
    const runPath = join(root, "target", "runs", "run-1", "output", "dashboard.html");
    const compatibilityPath = join(root, "target.html");
    const html = "<!doctype html>\n<html><body>same bytes</body></html>";

    writeDashboardArtifacts(html, [runPath, compatibilityPath]);

    expect(readFileSync(runPath, "utf8")).toBe(html);
    expect(readFileSync(compatibilityPath, "utf8")).toBe(html);
  });

  it("does not replace an existing successful report before a new write", () => {
    const root = mkdtempSync(join(tmpdir(), "eval-dashboard-preserve-"));
    const compatibilityPath = join(root, "target.html");
    writeFileSync(compatibilityPath, "last successful report", "utf8");

    expect(readFileSync(compatibilityPath, "utf8")).toBe("last successful report");
  });
});
