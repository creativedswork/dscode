import type { EvalDashboardServerEvent } from "../types";

export const EVAL_DASHBOARD_CACHE_STORAGE_KEY = "dscode-eval-dash-cache";
export const EVAL_DASHBOARD_CACHE_FORMAT_VERSION = 1;
export const MAX_EVAL_DASHBOARD_CACHE_ENTRIES = 5;

export interface EvalDashboardCacheEntry {
  formatVersion: number;
  targetSessionId: string;
  runId: string;
  generatedAt: number;
  html: string;
  accessedAt: number;
}

export type EvalDashboardCache = Record<string, EvalDashboardCacheEntry>;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function evalDashboardCacheKey(
  targetSessionId: string,
  runId: string,
): string {
  return `${targetSessionId}:${runId}`;
}

function isValidEntry(
  key: string,
  value: unknown,
): value is EvalDashboardCacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return entry.formatVersion === EVAL_DASHBOARD_CACHE_FORMAT_VERSION
    && typeof entry.targetSessionId === "string"
    && entry.targetSessionId.length > 0
    && typeof entry.runId === "string"
    && entry.runId.length > 0
    && key === evalDashboardCacheKey(entry.targetSessionId, entry.runId)
    && typeof entry.generatedAt === "number"
    && Number.isFinite(entry.generatedAt)
    && typeof entry.accessedAt === "number"
    && Number.isFinite(entry.accessedAt)
    && typeof entry.html === "string"
    && entry.html.length > 0;
}

export function normalizeEvalDashboardCache(
  value: unknown,
): EvalDashboardCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const validEntries: Array<[string, EvalDashboardCacheEntry]> = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isValidEntry(key, entry)) validEntries.push([key, entry]);
  }
  const entries = validEntries
    .sort(([, a], [, b]) => b.accessedAt - a.accessedAt)
    .slice(0, MAX_EVAL_DASHBOARD_CACHE_ENTRIES);
  return Object.fromEntries(entries);
}

export function loadEvalDashboardCache(
  storage: StorageLike = localStorage,
): EvalDashboardCache {
  try {
    const raw = storage.getItem(EVAL_DASHBOARD_CACHE_STORAGE_KEY);
    if (!raw) return {};
    const cache = normalizeEvalDashboardCache(JSON.parse(raw));
    storage.setItem(EVAL_DASHBOARD_CACHE_STORAGE_KEY, JSON.stringify(cache));
    return cache;
  } catch {
    try {
      storage.removeItem(EVAL_DASHBOARD_CACHE_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browsing modes.
    }
    return {};
  }
}

export function saveEvalDashboardCache(
  cache: EvalDashboardCache,
  storage: StorageLike = localStorage,
): void {
  try {
    storage.setItem(
      EVAL_DASHBOARD_CACHE_STORAGE_KEY,
      JSON.stringify(normalizeEvalDashboardCache(cache)),
    );
  } catch {
    // Eval history remains durable in ~/.dscode/eval when localStorage is full.
  }
}

export function cacheCompletedEvalDashboard(
  cache: EvalDashboardCache,
  event: Extract<EvalDashboardServerEvent, { status: "completed" }>,
  accessedAt = Date.now(),
): EvalDashboardCache {
  const key = evalDashboardCacheKey(event.targetSessionId, event.runId);
  const existing = cache[key];
  const next: EvalDashboardCache = {
    ...cache,
    [key]: existing
      ? { ...existing, accessedAt }
      : {
          formatVersion: EVAL_DASHBOARD_CACHE_FORMAT_VERSION,
          targetSessionId: event.targetSessionId,
          runId: event.runId,
          generatedAt: event.generatedAt,
          html: event.html,
          accessedAt,
        },
  };
  return normalizeEvalDashboardCache(next);
}

export function touchEvalDashboardCacheEntry(
  cache: EvalDashboardCache,
  targetSessionId: string,
  runId: string,
  accessedAt = Date.now(),
): EvalDashboardCache {
  const key = evalDashboardCacheKey(targetSessionId, runId);
  const existing = cache[key];
  if (!existing) return cache;
  return {
    ...cache,
    [key]: { ...existing, accessedAt },
  };
}

export function getLatestEvalDashboardEntry(
  cache: EvalDashboardCache,
): EvalDashboardCacheEntry | undefined {
  return Object.values(cache)
    .sort((a, b) => b.accessedAt - a.accessedAt)[0];
}

export function getLatestEvalDashboardEntryForTarget(
  cache: EvalDashboardCache,
  targetSessionId: string,
): EvalDashboardCacheEntry | undefined {
  return Object.values(cache)
    .filter((entry) => entry.targetSessionId === targetSessionId)
    .sort((a, b) =>
      b.generatedAt - a.generatedAt || b.accessedAt - a.accessedAt
    )[0];
}
