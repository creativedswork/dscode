import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";

const REMOVED_ENTRIES = [
  "src/core",
  "src/utils",
  "src/agents/application",
  "src/commands",
  "src/ui/commands.ts",
  "src/integrations/types.ts",
  "src/integrations/settings-source.ts",
];

const REMOVED_MODULES = [
  "core/config",
  "core/events",
  "core/harness",
  "core/main",
  "\"src\", \"core\"",
  "utils/logger",
  "utils/at-file-resolver",
  "utils/image-cache",
  "agents/application",
  "src/commands/",
  "ui/commands",
  "ui/tui-app",
  "ui/tui-backend",
  "ui/tui-activity-inspector",
  "ui/tui-permission-input",
  "ui/shared/file-attachments",
  "application/path-safety",
  "integrations/types",
  "integrations/settings-source",
];

const ACTIVE_FILES = [
  ...walk("src"),
  ...walk("tests"),
  ...walk("scripts"),
  ...walk("examples"),
  ...walk("openspec/specs"),
  "package.json",
  "README.md",
  "docs/ARCHITECTURE.md",
].filter((path) =>
  path !== "tests/architecture/removed-paths.test.ts"
  && [".ts", ".tsx", ".mts", ".mjs", ".json", ".md"].includes(extname(path))
);

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("removed source paths", () => {
  it("does not recreate removed owner entries", () => {
    for (const path of REMOVED_ENTRIES) {
      expect(existsSync(path), path).toBe(false);
    }
  });

  it("has no active references to removed modules", () => {
    const stale = ACTIVE_FILES.flatMap((path) => {
      const content = readFileSync(path, "utf8");
      return REMOVED_MODULES
        .filter((module) => content.includes(module))
        .map((module) => `${path}: ${module}`);
    });

    expect(stale).toEqual([]);
  });
});
