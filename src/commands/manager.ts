import type { CommandManifest } from "../core/types.js";
import { scanCommandDirs } from "./loader.js";

export class CommandManager {
  private manifests = new Map<string, CommandManifest>();

  constructor(userCommandsDir: string, projectCommandsDir: string) {
    const externalManifests = scanCommandDirs(userCommandsDir, projectCommandsDir);
    for (const m of externalManifests) {
      this.manifests.set(m.name, m);
    }
  }

  getManifest(name: string): CommandManifest | undefined {
    return this.manifests.get(name);
  }

  listManifests(): CommandManifest[] {
    return Array.from(this.manifests.values());
  }

  getSystemPromptSection(): string {
    if (this.manifests.size === 0) return "";

    const lines = ["## Commands"];
    lines.push("");
    lines.push("You can invoke commands by typing `/` followed by the command name in your message.");
    lines.push("Available commands:");
    lines.push("");
    for (const [, manifest] of this.manifests) {
      lines.push(`- \`/${manifest.name}\` — ${manifest.description}`);
    }

    return lines.join("\n");
  }
}
