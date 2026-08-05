import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import type { MultiAgentTrajectory } from "../trajectory.js";

export type ChiefStage =
  | "prepare"
  | "graph"
  | "oracle"
  | "backtrack"
  | "attribution"
  | "rules"
  | "dashboard";
export type ChiefStageStatus = "pending" | "running" | "done" | "failed";
export type EvalRunStatus = "active" | "completed" | "failed";

export interface EvalRunManifest {
  version: 1;
  runId: string;
  targetSessionId: string;
  invokingSessionId: string;
  createdAt: number;
  updatedAt: number;
  status: EvalRunStatus;
  actorCount: number;
  applicationCount: number;
  evidence: MultiAgentTrajectory["evidence"];
  chunks: string[];
  actorIndex: Record<string, {
    application: string;
    role: "main" | "subagent";
    stepIds: number[];
    chunkFiles: string[];
  }>;
  currentStage: ChiefStage;
  stages: Record<ChiefStage, {
    status: ChiefStageStatus;
    startedAt?: number;
    endedAt?: number;
    workerAgentId?: string;
    application?: string;
    retryCount?: number;
    error?: string;
  }>;
}

export interface EvalRunContext {
  evalRoot: string;
  targetRoot: string;
  runRoot: string;
  libraryDir: string;
  outputDir: string;
  manifestPath: string;
  manifest: EvalRunManifest;
}

const STAGES: ChiefStage[] = [
  "prepare",
  "graph",
  "oracle",
  "backtrack",
  "attribution",
  "rules",
  "dashboard",
];
const CHUNK_SIZE = 200;

export function evalRootDir(): string {
  return join(homedir(), ".dscode", "eval");
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.${globalThis.process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function readManifest(path: string): Promise<EvalRunManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as EvalRunManifest;
    return parsed.version === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function chunkName(start: number, end: number): string {
  return `steps-${String(start).padStart(4, "0")}-${String(end).padStart(4, "0")}.json`;
}

function emptyStages(now: number): EvalRunManifest["stages"] {
  return Object.fromEntries(STAGES.map((stage) => [
    stage,
    stage === "prepare"
      ? { status: "done", startedAt: now, endedAt: now }
      : { status: "pending" },
  ])) as EvalRunManifest["stages"];
}

async function listRunDirectories(evalRoot: string): Promise<Array<{
  path: string;
  createdAt: number;
  status: EvalRunStatus;
}>> {
  let targets: string[];
  try {
    targets = await readdir(evalRoot);
  } catch {
    return [];
  }
  const runs: Array<{ path: string; createdAt: number; status: EvalRunStatus }> = [];
  for (const target of targets) {
    const runsDir = join(evalRoot, target, "runs");
    let names: string[];
    try {
      names = await readdir(runsDir);
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(runsDir, name);
      const manifest = await readManifest(join(path, "manifest.json"));
      if (manifest) {
        runs.push({ path, createdAt: manifest.createdAt, status: manifest.status });
        continue;
      }
      try {
        const details = await stat(path);
        if (details.isDirectory()) {
          runs.push({ path, createdAt: details.mtimeMs, status: "failed" });
        }
      } catch {
        // Concurrent cleanup can remove a directory between readdir and stat.
      }
    }
  }
  return runs;
}

export async function cleanupEvalRuns(
  evalRoot: string,
  retain = 10,
): Promise<string[]> {
  const runs = await listRunDirectories(evalRoot);
  const activeCount = runs.filter((run) => run.status === "active").length;
  const completed = runs
    .filter((run) => run.status !== "active")
    .sort((a, b) => b.createdAt - a.createdAt);
  const keepCompleted = Math.max(0, retain - activeCount);
  const removed = completed.slice(keepCompleted);
  await Promise.all(removed.map((run) => rm(run.path, { recursive: true, force: true })));
  return removed.map((run) => run.path);
}

export async function createEvalRun(
  trajectory: MultiAgentTrajectory,
  invokingSessionId: string,
  options: {
    evalRoot?: string;
    runId?: string;
    now?: number;
    retain?: number;
  } = {},
): Promise<EvalRunContext> {
  const evalRoot = options.evalRoot ?? evalRootDir();
  const runId = safeSegment(options.runId ?? randomUUID());
  const now = options.now ?? Date.now();
  const targetPrefix = safeSegment(trajectory.session.metadata.id.slice(0, 8));
  const targetRoot = join(evalRoot, targetPrefix);
  const runRoot = join(targetRoot, "runs", runId);
  const libraryDir = join(runRoot, "library");
  const outputDir = join(runRoot, "output");
  const manifestPath = join(runRoot, "manifest.json");
  await Promise.all([
    mkdir(libraryDir, { recursive: true }),
    mkdir(outputDir, { recursive: true }),
  ]);

  await Promise.all([
    atomicWriteJson(join(libraryDir, "session.json"), {
      version: trajectory.session.version,
      metadata: trajectory.session.metadata,
    }),
    atomicWriteJson(join(libraryDir, "actors.json"), trajectory.actors),
    atomicWriteJson(join(libraryDir, "topology.json"), {
      controlEdges: trajectory.controlEdges,
      dataEdges: trajectory.dataEdges,
      evidence: trajectory.evidence,
    }),
  ]);

  const chunks: string[] = [];
  for (let start = 0; start < trajectory.steps.length; start += CHUNK_SIZE) {
    const steps = trajectory.steps.slice(start, start + CHUNK_SIZE);
    const name = chunkName(steps[0].stepId, steps.at(-1)!.stepId);
    chunks.push(name);
    await atomicWriteJson(join(libraryDir, name), steps);
  }
  const chunkByStep = new Map<number, string>();
  for (const name of chunks) {
    const [start, end] = basename(name, ".json")
      .replace("steps-", "")
      .split("-")
      .map(Number);
    for (let step = start; step <= end; step++) chunkByStep.set(step, name);
  }
  const actorIndex = Object.fromEntries(trajectory.actors.map((actor) => {
    const stepIds = trajectory.steps
      .filter((step) => step.agentId === actor.agentId)
      .map((step) => step.stepId);
    return [actor.agentId, {
      application: actor.application,
      role: actor.role,
      stepIds,
      chunkFiles: [...new Set(stepIds.map((stepId) => chunkByStep.get(stepId)).filter(
        (value): value is string => !!value,
      ))],
    }];
  }));
  await atomicWriteJson(join(libraryDir, "actor-index.json"), actorIndex);

  const manifest: EvalRunManifest = {
    version: 1,
    runId,
    targetSessionId: trajectory.session.metadata.id,
    invokingSessionId,
    createdAt: now,
    updatedAt: now,
    status: "active",
    actorCount: trajectory.actors.length,
    applicationCount: new Set(trajectory.actors.map((actor) => actor.application)).size,
    evidence: trajectory.evidence,
    chunks,
    actorIndex,
    currentStage: "prepare",
    stages: emptyStages(now),
  };
  await atomicWriteJson(manifestPath, manifest);
  await cleanupEvalRuns(evalRoot, options.retain ?? 10);
  return {
    evalRoot,
    targetRoot,
    runRoot,
    libraryDir,
    outputDir,
    manifestPath,
    manifest,
  };
}

export async function updateRunStage(
  context: EvalRunContext,
  stage: ChiefStage,
  update: Partial<EvalRunManifest["stages"][ChiefStage]> & {
    status: ChiefStageStatus;
  },
): Promise<EvalRunManifest> {
  const now = Date.now();
  const current = await readManifest(context.manifestPath) ?? context.manifest;
  const next: EvalRunManifest = {
    ...current,
    updatedAt: now,
    currentStage: stage,
    stages: {
      ...current.stages,
      [stage]: {
        ...current.stages[stage],
        ...update,
        startedAt: update.status === "running"
          ? update.startedAt ?? current.stages[stage].startedAt ?? now
          : update.startedAt ?? current.stages[stage].startedAt,
        endedAt: ["done", "failed"].includes(update.status)
          ? update.endedAt ?? now
          : update.endedAt ?? current.stages[stage].endedAt,
      },
    },
  };
  await atomicWriteJson(context.manifestPath, next);
  context.manifest = next;
  return next;
}

export async function writeStageOutput(
  context: EvalRunContext,
  name: string,
  value: unknown,
): Promise<string> {
  const path = join(context.outputDir, `${safeSegment(name)}.json`);
  await atomicWriteJson(path, value);
  return path;
}

export async function finishEvalRun(
  context: EvalRunContext,
  status: Extract<EvalRunStatus, "completed" | "failed">,
): Promise<EvalRunManifest> {
  const current = await readManifest(context.manifestPath) ?? context.manifest;
  const next = { ...current, status, updatedAt: Date.now() };
  await atomicWriteJson(context.manifestPath, next);
  context.manifest = next;
  return next;
}
