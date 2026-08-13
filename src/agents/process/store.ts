import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AgentProcess, SerializedAgentProcess } from "./types.js";

function projectSlug(projectPath: string): string {
  const name = projectPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "project";
  const hash = createHash("sha256").update(projectPath).digest("hex").slice(0, 12);
  return `${name.replace(/[^a-zA-Z0-9._-]/g, "-")}-${hash}`;
}

export function serializeAgentProcess(
  agentProcess: AgentProcess,
): SerializedAgentProcess {
  return {
    version: 1,
    agentId: agentProcess.agentId,
    parentAgentId: agentProcess.parentAgentId,
    parentSessionId: agentProcess.parentSessionId,
    description: agentProcess.description,
    application: agentProcess.application,
    role: agentProcess.role,
    state: agentProcess.state,
    attachment: agentProcess.attachment,
    recording: agentProcess.recording,
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
    const projectPath = agentProcess.context.worktree?.repositoryRoot
      ?? agentProcess.context.cwd;
    const directory = this.resolveDirectory(projectPath);
    const operation = this.writeQueue.then(() =>
      this.saveNow(agentProcess, directory)
    );
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  private async saveNow(
    agentProcess: AgentProcess,
    directory: string,
  ): Promise<void> {
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${agentProcess.agentId}.json`);
    const temporary = `${path}.${globalThis.process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(serializeAgentProcess(agentProcess), null, 2)}\n`, "utf8");
    await rename(temporary, path);
    await this.updateIndex(agentProcess, directory);
  }

  async load(agentId: string): Promise<SerializedAgentProcess | undefined> {
    try {
      const raw = await readFile(join(this.directory, `${agentId}.json`), "utf8");
      const parsed = JSON.parse(raw) as Omit<SerializedAgentProcess, "recording">
        & Partial<Pick<SerializedAgentProcess, "recording">>;
      return parsed.version === 1
        ? { ...parsed, recording: parsed.recording ?? "session" }
        : undefined;
    } catch {
      return undefined;
    }
  }

  async loadMany(agentIds: readonly string[]): Promise<{
    found: Map<string, SerializedAgentProcess>;
    missing: string[];
  }> {
    const uniqueIds = [...new Set(agentIds)];
    const records = await Promise.all(uniqueIds.map(async (agentId) => ({
      agentId,
      record: await this.load(agentId),
    })));
    const found = new Map<string, SerializedAgentProcess>();
    const missing: string[] = [];
    for (const { agentId, record } of records) {
      if (record) found.set(agentId, record);
      else missing.push(agentId);
    }
    return { found, missing };
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

  private async updateIndex(
    agentProcess: AgentProcess,
    directory: string,
  ): Promise<void> {
    const path = join(directory, "index.json");
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
      description: agentProcess.description,
      application: agentProcess.application.name,
      state: agentProcess.state,
      attachment: agentProcess.attachment,
      recording: agentProcess.recording,
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
