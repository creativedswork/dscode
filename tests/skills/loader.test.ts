import { describe, it, expect } from "vitest";
import { parseSkillManifest } from "../../src/skills/loader.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTempSkill(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-test-"));
  const filePath = join(dir, "SKILL.md");
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("parseSkillManifest", () => {
  it("should parse a valid SKILL.md with inline tools list", () => {
    const filePath = createTempSkill(`---
name: test-skill
description: A test skill
tools: [read_file, bash]
---
Do something useful.
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("test-skill");
    expect(manifest!.description).toBe("A test skill");
    expect(manifest!.tools).toEqual(["read_file", "bash"]);
    expect(manifest!.instructions).toBe("Do something useful.");
    expect(manifest!.source).toBe("user");
    expect(manifest!.path).toBe(filePath);
  });

  it("should parse a valid SKILL.md with YAML list tools", () => {
    const filePath = createTempSkill(`---
name: my-skill
description: My skill description
tools:
  - read_file
  - list_files
  - grep
---
Instructions here.
`);
    const manifest = parseSkillManifest(filePath, "project");
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("my-skill");
    expect(manifest!.description).toBe("My skill description");
    expect(manifest!.tools).toEqual(["read_file", "list_files", "grep"]);
    expect(manifest!.instructions).toBe("Instructions here.");
    expect(manifest!.source).toBe("project");
  });

  it("should return null for missing frontmatter", () => {
    const filePath = createTempSkill(`Just some text without frontmatter.`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).toBeNull();
  });

  it("should return null for incomplete frontmatter", () => {
    const filePath = createTempSkill(`---
name: only-name
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).toBeNull();
  });

  it("should return null for missing name", () => {
    const filePath = createTempSkill(`---
description: no name here
---
Body`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).toBeNull();
  });

  it("should return null for missing description", () => {
    const filePath = createTempSkill(`---
name: no-desc
---
Body`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).toBeNull();
  });

  it("should handle empty instructions body", () => {
    const filePath = createTempSkill(`---
name: empty-body
description: No instructions
tools: [read_file]
---
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).not.toBeNull();
    expect(manifest!.instructions).toBeUndefined();
  });

  it("should handle quoted values in frontmatter", () => {
    const filePath = createTempSkill(`---
name: "quoted-name"
description: 'Quoted description'
tools: [read_file]
---
Body
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe("quoted-name");
    expect(manifest!.description).toBe("Quoted description");
  });

  it("should handle multi-line body with --- in content", () => {
    const filePath = createTempSkill(`---
name: multi-line
description: Has dashes in body
tools: [read_file]
---
Some text
---
More text
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).not.toBeNull();
    expect(manifest!.instructions).toBe("Some text\n---\nMore text");
  });

  it("should return null for non-existent file", () => {
    const manifest = parseSkillManifest("/nonexistent/SKILL.md", "user");
    expect(manifest).toBeNull();
  });

  it("should handle tools with no tools field (undefined)", () => {
    const filePath = createTempSkill(`---
name: no-tools
description: No tools specified
---
Body
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).not.toBeNull();
    expect(manifest!.tools).toBeUndefined();
  });

  it("should handle empty tools list", () => {
    const filePath = createTempSkill(`---
name: empty-tools
description: Empty tools
tools: []
---
Body
`);
    const manifest = parseSkillManifest(filePath, "user");
    expect(manifest).not.toBeNull();
    expect(manifest!.tools).toEqual([]);
  });
});
