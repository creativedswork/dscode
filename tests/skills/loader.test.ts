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

  describe("YAML block scalar description", () => {
    it("should parse folded block scalar (>) - lines joined with spaces", () => {
      const filePath = createTempSkill(`---
name: folded
description: >
  The foundational knowledge distillation pattern for building
  and maintaining an AI-powered Obsidian wiki.
  Based on Andrej Karpathy's LLM Wiki architecture.
tools: [read_file]
---
Body
`);
      const manifest = parseSkillManifest(filePath, "user");
      expect(manifest).not.toBeNull();
      expect(manifest!.description).toBe(
        "The foundational knowledge distillation pattern for building and maintaining an AI-powered Obsidian wiki. Based on Andrej Karpathy's LLM Wiki architecture."
      );
    });

    it("should parse literal block scalar (|) - newlines preserved", () => {
      const filePath = createTempSkill(`---
name: literal
description: |
  Line one.
  Line two.
  Line three.
tools: [read_file]
---
Body
`);
      const manifest = parseSkillManifest(filePath, "user");
      expect(manifest).not.toBeNull();
      expect(manifest!.description).toBe("Line one.\nLine two.\nLine three.");
    });

    it("should handle folded with blank line as paragraph break", () => {
      const filePath = createTempSkill(`---
name: folded-para
description: >
  First paragraph line one.
  First paragraph line two.

  Second paragraph.
tools: [read_file]
---
Body
`);
      const manifest = parseSkillManifest(filePath, "user");
      expect(manifest).not.toBeNull();
      expect(manifest!.description).toBe(
        "First paragraph line one. First paragraph line two.\nSecond paragraph."
      );
    });

    it("should handle >- (folded with strip chomping)", () => {
      const filePath = createTempSkill(`---
name: folded-strip
description: >-
  Some text here.
  More text.

tools: [read_file]
---
Body
`);
      const manifest = parseSkillManifest(filePath, "user");
      expect(manifest).not.toBeNull();
      expect(manifest!.description).toBe("Some text here. More text.");
    });

    it("should handle |+ (literal with keep chomping)", () => {
      const filePath = createTempSkill(`---
name: literal-keep
description: |+
  Line A.
  Line B.


tools: [read_file]
---
Body
`);
      const manifest = parseSkillManifest(filePath, "user");
      expect(manifest).not.toBeNull();
      expect(manifest!.description).toBe("Line A.\nLine B.\n\n");
    });

    it("should coexist with YAML list tools after block scalar", () => {
      const filePath = createTempSkill(`---
name: full-skill
description: >
  A comprehensive skill for doing complex operations
  across multiple domains.
tools:
  - read_file
  - write_file
  - bash
---
Instructions body.
`);
      const manifest = parseSkillManifest(filePath, "project");
      expect(manifest).not.toBeNull();
      expect(manifest!.name).toBe("full-skill");
      expect(manifest!.description).toBe("A comprehensive skill for doing complex operations across multiple domains.");
      expect(manifest!.tools).toEqual(["read_file", "write_file", "bash"]);
      expect(manifest!.instructions).toBe("Instructions body.");
    });
  });
});
