import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { DriverRegistry } from "../drivers/registry.js";
import type { Skill, SkillManifest } from "../core/types.js";
import { scanSkillDirs } from "./loader.js";

// Default safe tools for skills that don't specify a tools whitelist.
// Read-only operations that are safe in any context.
const DEFAULT_ALLOWED_TOOLS = [
  "read_file",
  "list_files",
  "grep",
  "glob",
];

export class SkillManager {
  private manifests = new Map<string, SkillManifest>();
  private activeSkills = new Map<string, Skill>();

  constructor(userSkillsDir: string, projectSkillsDir: string) {
    const externalManifests = scanSkillDirs(userSkillsDir, projectSkillsDir);
    for (const m of externalManifests) {
      this.manifests.set(m.name, m);
    }
  }

  listManifests(): SkillManifest[] {
    return Array.from(this.manifests.values());
  }

  listAllSkillNames(): string[] {
    return Array.from(this.manifests.keys());
  }

  listAll(): { skill: Skill | SkillManifest; active: boolean }[] {
    const result: { skill: Skill | SkillManifest; active: boolean }[] = [];
    for (const [, manifest] of this.manifests) {
      result.push({ skill: manifest, active: this.activeSkills.has(manifest.name) });
    }
    return result;
  }

  isActive(name: string): boolean {
    return this.activeSkills.has(name);
  }

  activate(name: string, driverRegistry: DriverRegistry): Skill {
    if (this.activeSkills.has(name)) {
      return this.activeSkills.get(name)!;
    }

    const manifest = this.manifests.get(name);
    if (!manifest) {
      throw new Error(`Skill not found: ${name}`);
    }

    // Resolve allowed tools from the skill's tools whitelist
    const allowedToolNames = manifest.tools && manifest.tools.length > 0
      ? manifest.tools
      : DEFAULT_ALLOWED_TOOLS;

    // Filter driver tools by the whitelist
    const allDriverTools = driverRegistry.getAllTools();
    const tools = allDriverTools.filter((t) => allowedToolNames.includes(t.name));

    const skill: Skill = {
      name: manifest.name,
      description: manifest.description,
      tools,
      instructions: manifest.instructions,
      source: manifest.source,
    };

    this.activeSkills.set(name, skill);
    return skill;
  }

  deactivate(name: string): void {
    this.activeSkills.delete(name);
  }

  getTools(): AgentTool<any>[] {
    const tools: AgentTool<any>[] = [];
    for (const skill of this.activeSkills.values()) {
      tools.push(...skill.tools);
    }
    return tools;
  }

  getSystemPromptSection(): string {
    const sections: string[] = [];

    // List all available skills (both active and inactive) so the model knows what's available
    if (this.manifests.size > 0) {
      const lines = ["## Available Skills"];
      for (const [, manifest] of this.manifests) {
        const status = this.activeSkills.has(manifest.name) ? "active" : "inactive";
        lines.push(`- ${manifest.name} (${status}): ${manifest.description}`);
      }
      sections.push(lines.join("\n"));
    }

    // Active skills section: shows name, description, and allowed tools
    if (this.activeSkills.size > 0) {
      const lines = ["## Active Skills"];
      for (const [, skill] of this.activeSkills) {
        lines.push(`### ${skill.name}`);
        lines.push(`Description: ${skill.description}`);
        const toolNames = skill.tools.map((t) => t.name).join(", ");
        lines.push(`Allowed tools: ${toolNames}`);
        lines.push("");
      }
      sections.push(lines.join("\n"));
    }

    return sections.join("\n\n");
  }
}
