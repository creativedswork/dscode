import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  compileAgentApplication,
  compileAgentDefinition,
} from "./compiler.js";
import {
  DirectoryBundledApplicationProvider,
  PackageResourceProvider,
  type BundledApplicationProvider,
} from "./package-resources.js";
import type {
  AgentApplicationDiagnostic,
  AgentApplicationSnapshot,
  AgentApplicationSource,
  AgentApplicationSourceKind,
  AgentDefinition,
} from "./types.js";

export interface AgentApplicationRegistryOptions {
  projectPath: string;
  configDir: string;
  bundledDir?: string;
  bundledProvider?: BundledApplicationProvider;
  homeDir?: string;
  managedDir?: string;
  definitions?: readonly AgentDefinition[];
}

interface SourceDirectory {
  kind: AgentApplicationSourceKind;
  path: string;
  required?: boolean;
}

export class AgentApplicationRegistry {
  private applications = new Map<string, AgentApplicationSnapshot>();
  private diagnostics: AgentApplicationDiagnostic[] = [];
  private generation = 0;
  private readonly definitions = new Map<string, AgentDefinition>();

  constructor(private readonly options: AgentApplicationRegistryOptions) {
    for (const definition of options.definitions ?? []) {
      this.definitions.set(
        definition.name,
        structuredClone(definition),
      );
    }
  }

  async load(): Promise<void> {
    const generation = this.generation + 1;
    const next = new Map<string, AgentApplicationSnapshot>();
    const diagnostics: AgentApplicationDiagnostic[] = [];

    const bundledProvider = this.options.bundledProvider
      ?? (this.options.bundledDir
        ? new DirectoryBundledApplicationProvider(this.options.bundledDir)
        : new PackageResourceProvider());
    const bundled = await bundledProvider.load();
    for (const document of bundled) {
      try {
        const compiled = compileAgentApplication(document.content, document.source, generation);
        next.set(compiled.name, compiled);
      } catch (error) {
        diagnostics.push({
          level: "error",
          source: document.source,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (next.size === 0) {
      throw new Error("No valid bundled Agent applications found");
    }

    for (const directory of this.sourceDirectories()) {
      if (!existsSync(directory.path)) {
        if (directory.required) {
          diagnostics.push({
            level: "error",
            source: { kind: directory.kind, path: directory.path },
            message: "Required bundled application directory does not exist",
          });
        }
        continue;
      }

      const files = (await readdir(directory.path))
        .filter((name) => name.endsWith(".md"))
        .sort((a, b) => a.localeCompare(b));
      for (const file of files) {
        const source: AgentApplicationSource = {
          kind: directory.kind,
          path: join(directory.path, file),
        };
        try {
          const content = await readFile(source.path, "utf8");
          const preview = compileAgentApplication(content, source, generation);
          const base = next.get(preview.name);
          const compiled = base
            ? compileAgentApplication(content, source, generation, base)
            : preview;
          next.set(compiled.name, compiled);
        } catch (error) {
          diagnostics.push({
            level: "error",
            source,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    for (const definition of this.definitions.values()) {
      const source: AgentApplicationSource = {
        kind: "internal",
        path: `programmatic:${definition.name}`,
      };
      try {
        const compiled = compileAgentDefinition(
          definition,
          source,
          generation,
        );
        next.set(compiled.name, compiled);
      } catch (error) {
        diagnostics.push({
          level: "error",
          source,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.applications = next;
    this.diagnostics = diagnostics;
    this.generation = generation;
  }

  get(name: string): AgentApplicationSnapshot | undefined {
    return this.applications.get(name);
  }

  require(name: string): AgentApplicationSnapshot {
    const application = this.get(name);
    if (!application) throw new Error(`Unknown Agent application: ${name}`);
    return application;
  }

  list(): readonly AgentApplicationSnapshot[] {
    return Object.freeze(
      [...this.applications.values()].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  getDiagnostics(): readonly AgentApplicationDiagnostic[] {
    return this.diagnostics;
  }

  getGeneration(): number {
    return this.generation;
  }

  registerDefinition(definition: AgentDefinition): AgentApplicationSnapshot | undefined {
    const cloned = structuredClone(definition);
    const compiled = compileAgentDefinition(
      cloned,
      {
        kind: "internal",
        path: `programmatic:${cloned.name}`,
      },
      Math.max(this.generation, 1),
    );
    this.definitions.set(cloned.name, cloned);
    if (this.generation === 0) return undefined;
    this.applications.set(compiled.name, compiled);
    return compiled;
  }

  async updateProjectPath(projectPath: string): Promise<void> {
    this.options.projectPath = projectPath;
    await this.load();
  }

  private sourceDirectories(): SourceDirectory[] {
    const directories: SourceDirectory[] = [
      { kind: "user-claude", path: join(this.options.homeDir ?? homedir(), ".claude", "agents") },
      { kind: "user-dscode", path: join(this.options.configDir, "agents") },
      { kind: "project-claude", path: join(this.options.projectPath, ".claude", "agents") },
      { kind: "project-dscode", path: join(this.options.projectPath, ".dscode", "agents") },
    ];
    if (this.options.managedDir) {
      directories.push({ kind: "managed", path: this.options.managedDir });
    }
    return directories;
  }
}
