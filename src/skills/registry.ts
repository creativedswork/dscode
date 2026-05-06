import type { AgentTool } from "@mariozechner/pi-agent-core";

import type { Skill } from "../core/types.js";
import { readFileTool, writeFileTool, listFilesTool } from "./fs.js";
import { bashTool } from "./shell.js";
import { grepTool, globTool } from "./search.js";

const BUILTIN_SKILLS: Skill[] = [
  {
    name: "filesystem",
    description: "File read/write/list operations",
    tools: [readFileTool, writeFileTool, listFilesTool],
    systemPromptAddition: "You have filesystem access via read_file, write_file, and list_files. Use absolute paths.",
  },
  {
    name: "bash",
    description: "Shell command execution",
    tools: [bashTool],
    systemPromptAddition: "You can run shell commands via the bash tool. Use it for git, tests, builds, etc.",
  },
  {
    name: "search",
    description: "File content search and glob",
    tools: [grepTool, globTool],
    systemPromptAddition: "Use grep to search file contents and glob to find files by name pattern.",
  },
];

export class SkillRegistry {
  private skills = new Map<string, Skill>();
  private active = new Set<string>();

  constructor() {
    for (const skill of BUILTIN_SKILLS) {
      this.skills.set(skill.name, skill);
    }
  }

  activateSkill(name: string): void {
    if (!this.skills.has(name)) {
      throw new Error(`Skill not found: ${name}`);
    }
    this.active.add(name);
  }

  deactivateSkill(name: string): void {
    this.active.delete(name);
  }

  getTools(): AgentTool<any>[] {
    return Array.from(this.active)
      .map((name) => this.skills.get(name)!)
      .flatMap((skill) => skill.tools);
  }

  getSystemPromptAdditions(): string {
    return Array.from(this.active)
      .map((name) => this.skills.get(name)!)
      .filter((s) => s.systemPromptAddition)
      .map((s) => s.systemPromptAddition)
      .join("\n");
  }

  getActiveSkills(): Skill[] {
    return Array.from(this.active).map((name) => this.skills.get(name)!);
  }

  listAll(): Skill[] {
    return Array.from(this.skills.values());
  }

  isActive(name: string): boolean {
    return this.active.has(name);
  }
}
