import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { scanCommandDirs } from "../../src/slash-commands/loader.js";
import { CommandManager } from "../../src/slash-commands/manager.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function commandFile(directory: string, path: string, description: string): void {
  const fullPath = join(directory, path);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, `---\ndescription: ${description}\n---\nPrompt $input\n`);
}

describe("Slash Command manifests", () => {
  it("loads nested manifests and lets project commands override user commands", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-commands-"));
    temporaryDirectories.push(root);
    const user = join(root, "user");
    const project = join(root, "project");
    commandFile(user, "opsx/apply.md", "user apply");
    commandFile(project, "opsx/apply.md", "project apply");

    expect(scanCommandDirs(user, project)).toMatchObject([
      {
        name: "opsx:apply",
        description: "project apply",
        source: "project",
      },
    ]);
  });

  it("exposes loaded manifests through one manager", () => {
    const root = mkdtempSync(join(tmpdir(), "dscode-commands-"));
    temporaryDirectories.push(root);
    const user = join(root, "user");
    const project = join(root, "project");
    commandFile(user, "review.md", "review code");

    const manager = new CommandManager(user, project);

    expect(manager.getManifest("review")?.body).toBe("Prompt $input");
    expect(manager.getSystemPromptSection()).toContain("/review");
  });
});
