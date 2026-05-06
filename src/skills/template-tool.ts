import { execSync } from "node:child_process";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";

import type { SkillToolDef } from "../core/types.js";

export function createTemplateTool(def: SkillToolDef, skillName: string): AgentTool<any> {
  const schemaProps: Record<string, any> = {};
  for (const [name, param] of Object.entries(def.parameters)) {
    switch (param.type) {
      case "number":
        schemaProps[name] = Type.Number({ description: param.description });
        break;
      case "boolean":
        schemaProps[name] = Type.Boolean({ description: param.description });
        break;
      default:
        schemaProps[name] = Type.String({ description: param.description });
    }
  }

  const parameters = Type.Object(schemaProps);

  return {
    name: def.name,
    label: `${skillName}: ${def.name}`,
    description: def.description,
    parameters,
    execute: async (_id: string, args: any) => {
      const command = interpolateCommand(def.command, args as Record<string, unknown>);
      try {
        const stdout = execSync(command, {
          encoding: "utf8",
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        });
        const output = stdout.slice(0, 10000);
        return {
          content: [{ type: "text", text: output || "(no output)" }],
          details: { exitCode: 0, skill: skillName },
        };
      } catch (err: any) {
        const stdout = (err.stdout ?? "") as string;
        const stderr = (err.stderr ?? "") as string;
        const output = (stdout + "\n" + stderr).trim().slice(0, 10000);
        return {
          content: [{ type: "text", text: output || `Exit code: ${err.status ?? 1}` }],
          details: { exitCode: err.status ?? 1, error: true, skill: skillName },
        };
      }
    },
  };
}

function interpolateCommand(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = args[key];
    if (value === undefined || value === null) return "";
    return shellEscape(String(value));
  });
}

function shellEscape(s: string): string {
  if (s === "") return "''";
  if (!/[^a-zA-Z0-9@%+=:,./_-]/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\"'\"'") + "'";
}
