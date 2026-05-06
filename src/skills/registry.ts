import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import type { Skill, SkillManifest } from "../core/types.js";
import { readFileTool, writeFileTool, listFilesTool } from "./fs.js";
import { bashTool } from "./shell.js";
import { grepTool, globTool } from "./search.js";
import { scanSkillDirs } from "./loader.js";
import { createTemplateTool } from "./template-tool.js";

const BUILTIN_SKILLS: Skill[] = [
  {
    name: "filesystem",
    description: "File read/write/list operations",
    tools: [readFileTool, writeFileTool, listFilesTool],
    source: "builtin",
  },
  {
    name: "bash",
    description: "Shell command execution",
    tools: [bashTool],
    source: "builtin",
  },
  {
    name: "search",
    description: "File content search and glob",
    tools: [grepTool, globTool],
    source: "builtin",
  },
];

export class SkillRegistry {
  private builtinSkills: Skill[] = BUILTIN_SKILLS;
  private manifests = new Map<string, SkillManifest>();
  private activeExternal = new Map<string, Skill>();

  constructor(userSkillsDir: string, projectSkillsDir: string) {
    const externalManifests = scanSkillDirs(userSkillsDir, projectSkillsDir);
    for (const m of externalManifests) {
      this.manifests.set(m.name, m);
    }
  }

  getBuiltinSkills(): Skill[] {
    return this.builtinSkills;
  }

  listExternal(): SkillManifest[] {
    return Array.from(this.manifests.values());
  }

  listAll(): { skill: Skill | SkillManifest; active: boolean }[] {
    const result: { skill: Skill | SkillManifest; active: boolean }[] = [];
    for (const s of this.builtinSkills) {
      result.push({ skill: s, active: true });
    }
    for (const [name, manifest] of this.manifests) {
      result.push({ skill: manifest, active: this.activeExternal.has(name) });
    }
    return result;
  }

  isActive(name: string): boolean {
    if (this.builtinSkills.some((s) => s.name === name)) return true;
    return this.activeExternal.has(name);
  }

  activateSkill(name: string): Skill {
    if (this.activeExternal.has(name)) {
      return this.activeExternal.get(name)!;
    }

    const manifest = this.manifests.get(name);
    if (!manifest) {
      throw new Error(`Skill not found: ${name}`);
    }

    const tools: AgentTool<any>[] = [];
    if (manifest.tools) {
      for (const def of manifest.tools) {
        tools.push(createTemplateTool(def, name));
      }
    }

    const skill: Skill = {
      name: manifest.name,
      description: manifest.description,
      tools,
      instructions: manifest.instructions,
      source: manifest.source,
    };

    this.activeExternal.set(name, skill);
    return skill;
  }

  deactivateSkill(name: string): void {
    this.activeExternal.delete(name);
  }

  getTools(): AgentTool<any>[] {
    const tools: AgentTool<any>[] = [];
    for (const s of this.builtinSkills) {
      tools.push(...s.tools);
    }
    for (const s of this.activeExternal.values()) {
      tools.push(...s.tools);
    }
    tools.push(this.createActivateSkillTool());
    return tools;
  }

  getSystemPromptSection(): string {
    const inactive = Array.from(this.manifests.entries())
      .filter(([name]) => !this.activeExternal.has(name));

    const sections: string[] = [];

    if (inactive.length > 0 || this.activeExternal.size > 0) {
      const lines = ["## Available Skills"];
      for (const [, manifest] of this.manifests) {
        const status = this.activeExternal.has(manifest.name) ? "active" : "inactive";
        lines.push(`- ${manifest.name}: ${manifest.description} [${status}]`);
      }
      lines.push("");
      lines.push("Use the activate_skill tool to enable a skill, or /skills activate <name>.");
      sections.push(lines.join("\n"));
    }

    for (const [, skill] of this.activeExternal) {
      if (skill.instructions) {
        sections.push(`## Skill: ${skill.name}\n\n${skill.instructions}`);
      }
    }

    return sections.join("\n\n");
  }

  private createActivateSkillTool(): AgentTool<any> {
    const params = Type.Object({
      name: Type.String({ description: "Name of the skill to activate (see Available Skills)" }),
    });

    return {
      name: "activate_skill",
      label: "Activate skill",
      description: "Activate an external skill to gain access to its tools. Check Available Skills in system prompt.",
      parameters: params,
      execute: async (_id: string, args: any) => {
        try {
          const skill = this.activateSkill(args.name);
          const toolNames = skill.tools.map((t) => t.name).join(", ");
          const msg = `Skill "${skill.name}" activated. New tools available: ${toolNames || "(none)"}`;
          const full = skill.instructions ? `${msg}\n\nInstructions:\n${skill.instructions}` : msg;
          return {
            content: [{ type: "text", text: full }],
            details: { activated: skill.name, tools: skill.tools.map((t) => t.name) },
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            details: { error: true },
          };
        }
      },
    };
  }
}
