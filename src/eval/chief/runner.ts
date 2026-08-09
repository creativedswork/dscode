import type { AgentProcessApplicationPort } from "../../application/harness-api.js";
import type { Logger } from "../../utils/logger.js";
import type { ValidationResult } from "../schemas.js";
import {
  updateRunStage,
  type ChiefStage,
  type EvalRunContext,
} from "./workspace.js";

export interface StructuredAgentHost {
  agents: Pick<AgentProcessApplicationPort, "list" | "spawn">;
}

export interface StructuredAgentOptions<T> {
  host: StructuredAgentHost;
  application: string;
  prompt: string;
  workspace: string;
  stage: ChiefStage;
  validate: (value: unknown) => ValidationResult<T>;
  runContext?: EvalRunContext;
  signal?: AbortSignal;
  logger?: Logger;
  maxAttempts?: number;
  onWorker?: (agentId: string, attempt: number) => void;
}

export interface StructuredAgentResult<T> {
  value: T;
  attempts: number;
  workerAgentIds: string[];
  rawOutput: string;
}

export class StructuredAgentError extends Error {
  constructor(
    message: string,
    readonly application: string,
    readonly errors: string[],
    readonly workerAgentIds: string[],
  ) {
    super(message);
    this.name = "StructuredAgentError";
  }
}

function abortError(): Error {
  const error = new Error("CHIEF eval aborted");
  error.name = "AbortError";
  return error;
}

function extractStructuredJson(output: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // Continue with fenced and balanced JSON extraction.
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      JSON.parse(fenced);
      return fenced;
    } catch {
      // Continue with the balanced scanner.
    }
  }
  const start = [...trimmed].findIndex((character) => character === "{" || character === "[");
  if (start < 0) return undefined;
  const opening = trimmed[start];
  const closing = opening === "{" ? "}" : "]";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < trimmed.length; index++) {
    const character = trimmed[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") quoted = false;
      continue;
    }
    if (character === "\"") {
      quoted = true;
      continue;
    }
    if (character === opening) depth++;
    if (character === closing) {
      depth--;
      if (depth === 0) return trimmed.slice(start, index + 1);
    }
  }
  return undefined;
}

function retryPrompt(
  original: string,
  errors: readonly string[],
  output: string,
): string {
  return `${original}

Your previous output failed validation:
${errors.slice(0, 12).map((error) => `- ${error}`).join("\n")}

Previous output excerpt:
${output.slice(0, 2_000)}

Return the complete corrected JSON value only. Do not use markdown fences.`;
}

export async function runStructuredAgent<T>(
  options: StructuredAgentOptions<T>,
): Promise<StructuredAgentResult<T>> {
  const maxAttempts = options.maxAttempts ?? 2;
  if (maxAttempts < 1) throw new Error("maxAttempts must be at least 1");
  const parent = options.host.agents.list()
    .find((process) => process.role === "main");
  if (!parent) throw new Error("Cannot run CHIEF worker without a Main Agent process");
  const workers: string[] = [];
  let prompt = options.prompt;
  let lastErrors = ["Worker produced no output"];
  let lastOutput = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.signal?.aborted) throw abortError();
    if (options.runContext) {
      await updateRunStage(options.runContext, options.stage, {
        status: "running",
        application: options.application,
        retryCount: attempt - 1,
      });
    }
    let workerAgentId = "";
    const worker = await options.host.agents.spawn({
      application: options.application,
      parentAgentId: parent.agentId,
      input: { prompt },
      cwd: options.workspace,
      attachment: "foreground",
      recording: "process-only",
      signal: options.signal,
      onSpawn: (agentId) => {
        workerAgentId = agentId;
        options.onWorker?.(agentId, attempt);
      },
    });
    workerAgentId ||= worker.agentId;
    workers.push(workerAgentId);
    if (options.runContext) {
      await updateRunStage(options.runContext, options.stage, {
        status: "running",
        application: options.application,
        workerAgentId,
        retryCount: attempt - 1,
      });
    }
    const completed = worker.result;
    if (options.signal?.aborted || completed?.state === "terminated") {
      throw abortError();
    }
    lastOutput = completed?.output ?? "";
    if (completed?.state !== "completed") {
      lastErrors = [
        `Worker ${workerAgentId} exited as ${completed?.state ?? "unknown"}`,
        completed?.error ?? completed?.output ?? "Unknown worker failure",
      ];
    } else {
      const json = extractStructuredJson(lastOutput);
      if (!json) {
        lastErrors = ["Response contains no valid JSON object or array"];
      } else {
        try {
          const validation = options.validate(JSON.parse(json));
          if (validation.ok) {
            options.logger?.info(
              "CHIEF",
              `${options.application} completed in ${attempt} attempt(s)`,
            );
            return {
              value: validation.value,
              attempts: attempt,
              workerAgentIds: workers,
              rawOutput: lastOutput,
            };
          }
          lastErrors = validation.errors;
        } catch (error) {
          lastErrors = [
            `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
          ];
        }
      }
    }
    options.logger?.warn(
      "CHIEF",
      `${options.application} attempt ${attempt} failed: ${lastErrors.join("; ")}`,
    );
    if (attempt < maxAttempts) {
      prompt = retryPrompt(options.prompt, lastErrors, lastOutput);
    }
  }

  if (options.runContext) {
    await updateRunStage(options.runContext, options.stage, {
      status: "failed",
      application: options.application,
      workerAgentId: workers.at(-1),
      retryCount: Math.max(0, workers.length - 1),
      error: lastErrors.join("; "),
    });
  }
  throw new StructuredAgentError(
    `${options.application} failed structured output validation`,
    options.application,
    lastErrors,
    workers,
  );
}
