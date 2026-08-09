import type { AgentTool } from "@earendil-works/pi-agent-core";

export interface Skill {
  name: string;
  description: string;
  tools: AgentTool<any>[];
  instructions?: string;
  source: "user" | "project";
}

export interface SkillManifest {
  name: string;
  description: string;
  tools?: string[];
  instructions?: string;
  source: "user" | "project";
  path: string;
}
