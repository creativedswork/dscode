import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SkillManager } from "../../src/skills/manager.js";
import { DriverRegistry } from "../../src/drivers/registry.js";

function createSkillDir(baseDir: string, name: string, content: string): string {
  const dir = join(baseDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content, "utf8");
  return dir;
}

describe("SkillManager", () => {
  let userSkillsDir: string;
  let projectSkillsDir: string;
  let driverRegistry: DriverRegistry;

  beforeEach(() => {
    userSkillsDir = mkdtempSync(join(tmpdir(), "user-skills-"));
    projectSkillsDir = mkdtempSync(join(tmpdir(), "project-skills-"));
    driverRegistry = new DriverRegistry();
  });

  it("should scan and list manifests from user and project dirs", () => {
    createSkillDir(userSkillsDir, "skill-a", `---
name: skill-a
description: Skill A
tools: [read_file]
---
Do A.
`);
    createSkillDir(projectSkillsDir, "skill-b", `---
name: skill-b
description: Skill B
tools: [bash]
---
Do B.
`);

    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    const manifests = manager.listManifests();
    expect(manifests.length).toBe(2);
    const names = manifests.map((m) => m.name).sort();
    expect(names).toEqual(["skill-a", "skill-b"]);
  });

  it("should list all skill names", () => {
    createSkillDir(userSkillsDir, "skill-a", `---
name: skill-a
description: Skill A
tools: [read_file]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    expect(manager.listAllSkillNames()).toEqual(["skill-a"]);
  });

  it("should return empty list when no skill dirs exist", () => {
    const manager = new SkillManager(
      join(tmpdir(), "nonexistent-user"),
      join(tmpdir(), "nonexistent-project"),
    );
    expect(manager.listManifests()).toEqual([]);
    expect(manager.listAllSkillNames()).toEqual([]);
  });

  it("should activate a skill and filter tools by whitelist", () => {
    createSkillDir(userSkillsDir, "my-skill", `---
name: my-skill
description: My skill
tools: [read_file, bash]
---
Instructions.
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    const skill = manager.activate("my-skill", driverRegistry);

    expect(skill.name).toBe("my-skill");
    expect(skill.description).toBe("My skill");
    expect(skill.instructions).toBe("Instructions.");
    expect(skill.source).toBe("user");

    // Should only have read_file and bash tools
    const toolNames = skill.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(["bash", "read_file"]);
  });

  it("should use default safe tools when skill has no tools whitelist", () => {
    createSkillDir(userSkillsDir, "safe-skill", `---
name: safe-skill
description: Safe skill
---
Instructions.
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    const skill = manager.activate("safe-skill", driverRegistry);

    const toolNames = skill.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(["glob", "grep", "list_files", "read_file"]);
  });

  it("should use default safe tools when skill has empty tools list", () => {
    createSkillDir(userSkillsDir, "empty-tools-skill", `---
name: empty-tools-skill
description: Empty tools
tools: []
---
Instructions.
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    const skill = manager.activate("empty-tools-skill", driverRegistry);

    const toolNames = skill.tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(["glob", "grep", "list_files", "read_file"]);
  });

  it("should throw when activating unknown skill", () => {
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    expect(() => manager.activate("nonexistent", driverRegistry)).toThrow(
      "Skill not found: nonexistent",
    );
  });

  it("should deactivate a skill", () => {
    createSkillDir(userSkillsDir, "my-skill", `---
name: my-skill
description: My skill
tools: [read_file]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    manager.activate("my-skill", driverRegistry);
    expect(manager.isActive("my-skill")).toBe(true);

    manager.deactivate("my-skill");
    expect(manager.isActive("my-skill")).toBe(false);
  });

  it("should return active status in listAll", () => {
    createSkillDir(userSkillsDir, "skill-a", `---
name: skill-a
description: Skill A
tools: [read_file]
---
`);
    createSkillDir(userSkillsDir, "skill-b", `---
name: skill-b
description: Skill B
tools: [read_file]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    manager.activate("skill-a", driverRegistry);

    const all = manager.listAll();
    const a = all.find((s) => (s.skill as any).name === "skill-a");
    const b = all.find((s) => (s.skill as any).name === "skill-b");
    expect(a!.active).toBe(true);
    expect(b!.active).toBe(false);
  });

  it("should return tools from all active skills", () => {
    createSkillDir(userSkillsDir, "skill-a", `---
name: skill-a
description: Skill A
tools: [read_file]
---
`);
    createSkillDir(userSkillsDir, "skill-b", `---
name: skill-b
description: Skill B
tools: [bash]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    manager.activate("skill-a", driverRegistry);
    manager.activate("skill-b", driverRegistry);

    const tools = manager.getTools();
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(["bash", "read_file"]);
  });

  it("should return empty tools when no skills active", () => {
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    expect(manager.getTools()).toEqual([]);
  });

  it("should generate system prompt section with available and active skills", () => {
    createSkillDir(userSkillsDir, "skill-a", `---
name: skill-a
description: Skill A
tools: [read_file]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    manager.activate("skill-a", driverRegistry);

    const section = manager.getSystemPromptSection();
    expect(section).toContain("Available Skills");
    expect(section).toContain("skill-a");
    expect(section).toContain("active");
    expect(section).toContain("Active Skills");
    expect(section).toContain("Allowed tools: read_file");
  });

  it("should return empty system prompt section when no skills exist", () => {
    const manager = new SkillManager(
      join(tmpdir(), "nonexistent"),
      join(tmpdir(), "nonexistent"),
    );
    expect(manager.getSystemPromptSection()).toBe("");
  });

  it("should not duplicate activate a skill", () => {
    createSkillDir(userSkillsDir, "my-skill", `---
name: my-skill
description: My skill
tools: [read_file]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    const first = manager.activate("my-skill", driverRegistry);
    const second = manager.activate("my-skill", driverRegistry);
    expect(second).toBe(first); // same reference
  });

  it("should prefer project skill over user skill with same name", () => {
    createSkillDir(userSkillsDir, "same-name", `---
name: same-name
description: User version
tools: [read_file]
---
`);
    createSkillDir(projectSkillsDir, "same-name", `---
name: same-name
description: Project version
tools: [bash]
---
`);
    const manager = new SkillManager(userSkillsDir, projectSkillsDir);
    const manifests = manager.listManifests();
    expect(manifests.length).toBe(1); // project overrides user
    expect(manifests[0].description).toBe("Project version");
  });
});
