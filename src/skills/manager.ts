import { dirname } from "node:path";

import type { DriverRegistryPort } from "../drivers/types.js";
import type { Skill, SkillManifest } from "./types.js";
import { scanSkillDirs } from "./loader.js";

export function formatLoadedSkill(manifest: SkillManifest): string {
  const resourceRoot = dirname(manifest.path);
  const lines: string[] = [
    `# ${manifest.name}`,
    `Description: ${manifest.description}`,
    `Source: ${manifest.source}`,
    `Resource root: ${resourceRoot}`,
    manifest.tools && manifest.tools.length > 0
      ? `Allowed tools: ${manifest.tools.join(", ")}`
      : "Allowed tools: all driver tools",
  ];
  if (manifest.instructions) {
    lines.push("", "## Instructions", manifest.instructions);
  }
  lines.push(
    "",
    "## Resource resolution contract",
    `- Resolve every relative file reference in this Skill against the exact resource root: \`${resourceRoot}\`.`,
    "- Use the resolved absolute path when calling file tools.",
    "- Never guess or substitute `.claude`, `.trae`, `.dscode`, or another compatibility directory.",
    "",
    "## Runtime continuation contract",
    "- Loading this document does not complete the Skill.",
    "- Continue execution in this turn when the request and supplied material satisfy the prerequisites.",
    "- Do not stop at a plan, summary, or redundant confirmation unless an essential decision is missing or the Skill explicitly requires confirmation.",
    "- When the Skill requires SubAgents and `spawn_agent` is available, call it before ending the turn.",
  );
  return lines.join("\n");
}

export class SkillManager {
  private manifests = new Map<string, SkillManifest>();
  private activeSkills = new Set<string>();

  constructor(userSkillsDir: string, projectSkillsDir: string) {
    const externalManifests = scanSkillDirs(userSkillsDir, projectSkillsDir);
    for (const m of externalManifests) {
      this.manifests.set(m.name, m);
    }
  }

  getManifest(name: string): SkillManifest | undefined {
    return this.manifests.get(name);
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
      result.push({
        skill: manifest,
        active: this.activeSkills.has(manifest.name),
      });
    }
    return result;
  }

  isActive(name: string): boolean {
    return this.activeSkills.has(name);
  }

  activate(name: string, driverRegistry: DriverRegistryPort): Skill {
    const manifest = this.manifests.get(name);
    if (!manifest) {
      throw new Error(`Skill not found: ${name}`);
    }

    // If skill specifies a tools whitelist, filter by it.
    // Otherwise, allow all driver tools.
    const allDriverTools = driverRegistry.getAllTools();
    const tools = manifest.tools && manifest.tools.length > 0
      ? allDriverTools.filter((t) => manifest.tools!.includes(t.name))
      : allDriverTools;

    const skill: Skill = {
      name: manifest.name,
      description: manifest.description,
      tools,
      instructions: manifest.instructions,
      source: manifest.source,
    };

    this.activeSkills.add(name);
    return skill;
  }

  deactivate(name: string): void {
    this.activeSkills.delete(name);
  }

  /**
   * Reload skill manifests from new directory paths.
   * Previously active skills are re-activated if they still exist;
   * skills that no longer exist are automatically deactivated.
   * Must provide driverRegistry so re-activated skills get correct tools.
   */
  reloadDirs(
    userSkillsDir: string,
    projectSkillsDir: string,
    _driverRegistry: DriverRegistryPort,
  ): void {
    // Remember which skills were active before reload
    const prevActive = new Set(this.activeSkills);

    // Clear and re-scan
    this.manifests.clear();
    this.activeSkills.clear();

    const externalManifests = scanSkillDirs(userSkillsDir, projectSkillsDir);
    for (const m of externalManifests) {
      this.manifests.set(m.name, m);
    }

    // Keep active names whose manifests still exist. Tool objects are resolved
    // only when activation is requested; they are not a second capability model.
    for (const name of prevActive) {
      if (this.manifests.has(name)) {
        this.activeSkills.add(name);
      }
    }
  }

  getSystemPromptSection(): string {
    const sections: string[] = [];

    // List only active skills — inactive skills are hidden from the model
    const activeManifests = this.listManifests().filter((m) => this.activeSkills.has(m.name));
    if (activeManifests.length > 0) {
      const lines = ["## Available Skills"];
      for (const manifest of activeManifests) {
        lines.push(`- ${manifest.name}: ${manifest.description}`);
      }
      sections.push(lines.join("\n"));
    }

    // Active skills section: shows name, description, and allowed tools
    if (this.activeSkills.size > 0) {
      const lines = ["## Active Skills"];
      for (const name of this.activeSkills) {
        const manifest = this.manifests.get(name);
        if (!manifest) continue;
        lines.push(`### ${manifest.name}`);
        lines.push(`Description: ${manifest.description}`);
        lines.push(
          manifest.tools?.length
            ? `Allowed tools: ${manifest.tools.join(", ")}`
            : "Allowed tools: all driver tools",
        );
        lines.push("");
      }
      sections.push(lines.join("\n"));
    }

    return sections.join("\n\n");
  }
}
