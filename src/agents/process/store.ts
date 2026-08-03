import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AgentProcess, SerializedAgentProcess } from "./types.js";

function projectSlug(projectPath: string): string {
  const name = projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
  const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
  return `${name.replace(/[^a-zA-Z0-9._-]/g, "-")}-${hash}`;
}

function serialize(agentProcess: AgentProcess): SerializedAgentProcess {
  return {
    version: 1,
    agentId: agentProcess.agentId,
    parentAgentId: agentProcess.parentAgentId,
    parentSessionId: agentProcess.parentSessionId,
    application: agentProcess.application,
    role: agentProcess.role,
    state: agentProcess.state,
    attachment: agentProcess.attachment,
    contextMode: agentProcess.contextMode,
    contextSelection: agentProcess.contextSelection,
    context: agentProcess.context,
    createdAt: agentProcess.createdAt,
    startedAt: agentProcess.startedAt,
    endedAt: agentProcess.endedAt,
    exit: agentProcess.exit,
    runtimeSnapshot: agentProcess.runtimeSnapshot,
  };
}

export class AgentProcessStore {
  private directory: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string, projectPath: string) {
    this.directory = this.resolveDirectory(projectPath);
  }

  updateProjectPath(projectPath: string): void {
    this.directory = this.resolveDirectory(projectPath);
  }

  async save(agentProcess: AgentProcess): Promise<void> {
    const operation = this.writeQueue.then(() => this.saveNow(agentProcess));
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  private async saveNow(agentProcess: AgentProcess): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, `${agentProcess.agentId}.json`);
    const temporary = `${path}.${globalThis.process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(serialize(agentProcess), null, 2)}\n`, "utf8");
    await rename(temporary, path);
    await this.updateIndex(agentProcess);
  }

  async load(agentId: string): Promise<SerializedAgentProcess | undefined> {
    try {
      const raw = await readFile(join(this.directory, `${agentId}.json`), "utf8");
      const parsed = JSON.parse(raw) as SerializedAgentProcess;
      return parsed.version === 1 ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<SerializedAgentProcess[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return [];
    }
    const records = await Promise.all(
      names.filter((name) => name.endsWith(".json") && name !== "index.json")
        .map((name) => this.load(name.slice(0, -5))),
    );
    return records.filter((record): record is SerializedAgentProcess => record !== undefined);
  }

  private resolveDirectory(projectPath: string): string {
    return join(this.dataDir, "agent-processes", "by-project", projectSlug(projectPath));
  }

  private async updateIndex(agentProcess: AgentProcess): Promise<void> {
    const path = join(this.directory, "index.json");
    let index: Array<Record<string, unknown>> = [];
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (Array.isArray(parsed)) index = parsed;
    } catch {
      // First write creates the index.
    }
    const summary = {
      agentId: agentProcess.agentId,
      parentAgentId: agentProcess.parentAgentId,
      parentSessionId: agentProcess.parentSessionId,
      application: agentProcess.application.name,
      state: agentProcess.state,
      attachment: agentProcess.attachment,
      contextMode: agentProcess.contextMode,
      createdAt: agentProcess.createdAt,
      endedAt: agentProcess.endedAt,
    };
    index = [
      ...index.filter((item) => item.agentId !== agentProcess.agentId),
      summary,
    ].sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    const temporary = `${path}.${globalThis.process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  }
}
