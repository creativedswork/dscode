import { createHash } from "node:crypto";
import { normalize } from "node:path";

import { canonicalStringify } from "./digest.js";
import type {
  ExecutionActionFingerprint,
  ExecutionOutcomeClass,
} from "./execution-episode-types.js";

const VOLATILE_KEYS = new Set([
  "callId",
  "commandId",
  "evidenceId",
  "expectedVersion",
  "requestId",
  "timestamp",
  "createdAt",
  "updatedAt",
  "version",
  "recordedAt",
]);

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const path = normalize(value.trim()).replaceAll("\\", "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function definedEntries(value: Record<string, unknown>): unknown {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? compactText(value) : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !VOLATILE_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

function filesystemArguments(args: Record<string, unknown>): unknown {
  return definedEntries({
    path: normalizedPath(args.path ?? args.file_path ?? args.filePath),
    target: canonicalValue(
      args.old_string
      ?? args.oldText
      ?? args.search
      ?? args.range
      ?? args.patch,
    ),
    replacement: canonicalValue(
      args.new_string
      ?? args.newText
      ?? args.replace
      ?? args.content,
    ),
  });
}

function commandArguments(args: Record<string, unknown>): unknown {
  return definedEntries({
    command: compactText(String(args.command ?? args.cmd ?? "")),
    cwd: normalizedPath(args.cwd ?? args.workdir),
  });
}

export function fingerprintExecutionAction(
  action: string,
  args: unknown,
  outcomeClass: ExecutionOutcomeClass,
): ExecutionActionFingerprint {
  const record = args && typeof args === "object" && !Array.isArray(args)
    ? args as Record<string, unknown>
    : {};
  const normalizedAction = action.trim().toLowerCase();
  const semanticArguments = /(?:bash|shell|command|exec)/.test(normalizedAction)
    ? commandArguments(record)
    : /(?:edit|write|patch|file)/.test(normalizedAction)
    ? filesystemArguments(record)
    : canonicalValue(args);
  const fingerprint = createHash("sha256").update(canonicalStringify({
    action: normalizedAction,
    semanticArguments,
    outcomeClass,
  })).digest("hex");
  return {
    action: normalizedAction,
    semanticArguments,
    outcomeClass,
    fingerprint,
  };
}
