import { AsyncLocalStorage } from "node:async_hooks";
import { isAbsolute, resolve } from "node:path";
import type { HostFacilities } from "./host-facilities.js";

export interface ExecutionContext {
  readonly hostId: string;
  readonly processId: string;
  readonly parentProcessId?: string;
  readonly sessionId: string;
  readonly application: string;
  readonly cwd: string;
  readonly facilities?: HostFacilities;
}

const executionContextStorage = new AsyncLocalStorage<ExecutionContext>();

function validateExecutionContext(context: ExecutionContext): void {
  const required = [
    ["hostId", context.hostId],
    ["processId", context.processId],
    ["sessionId", context.sessionId],
    ["application", context.application],
    ["cwd", context.cwd],
  ] as const;
  for (const [name, value] of required) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`ExecutionContext.${name} must be a non-empty string`);
    }
  }
  if (!isAbsolute(context.cwd)) {
    throw new Error("ExecutionContext.cwd must be absolute");
  }
}

export function runWithExecutionContext<T>(
  context: ExecutionContext,
  operation: () => T,
): T {
  validateExecutionContext(context);
  return executionContextStorage.run(Object.freeze(context), operation);
}

export function bindExecutionContext(
  context: ExecutionContext,
): () => void {
  validateExecutionContext(context);
  executionContextStorage.enterWith(Object.freeze({ ...context }));
  return () => executionContextStorage.disable();
}

export function getExecutionContext(): ExecutionContext | undefined {
  return executionContextStorage.getStore();
}

export function resolveExecutionPath(
  path: string,
  fallbackCwd: string = process.cwd(),
): string {
  if (isAbsolute(path)) return resolve(path);
  return resolve(getExecutionContext()?.cwd ?? fallbackCwd, path);
}

export function getHostFacility<T>(key: symbol): T | undefined {
  return getExecutionContext()?.facilities?.get<T>(key);
}
