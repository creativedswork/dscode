import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { stageAttachedFiles } from "../../src/ui/shared/file-attachments.js";

describe("stageAttachedFiles", () => {
  it("copies an external attachment into the session upload directory", () => {
    const project = mkdtempSync(join(tmpdir(), "dscode-project-"));
    const external = mkdtempSync(join(tmpdir(), "dscode-attachment-"));
    const source = join(external, "paper.pdf");
    writeFileSync(source, "pdf-content");

    const [staged] = stageAttachedFiles(
      project,
      "session-1",
      [source],
      1234,
    );

    expect(staged).toBe(
      join(project, ".dscode", "uploads", "session-1", "1234-1-paper.pdf"),
    );
    expect(readFileSync(staged, "utf8")).toBe("pdf-content");
  });

  it("keeps an existing project-local attachment in place", () => {
    const project = mkdtempSync(join(tmpdir(), "dscode-project-"));
    const assets = join(project, "assets");
    mkdirSync(assets);
    const source = join(assets, "notes.md");
    writeFileSync(source, "notes");

    expect(stageAttachedFiles(project, "session-1", [source], 1234))
      .toEqual([source]);
  });
});
