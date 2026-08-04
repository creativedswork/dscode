import { describe, expect, it } from "vitest";

import {
  cacheDashboardEntry,
  createDashboardCacheEntry,
  MAX_DASHBOARD_CACHE_ENTRIES,
} from "../../web/src/utils/dashboardCache.js";
import {
  cacheCompletedEvalDashboard,
  EVAL_DASHBOARD_CACHE_FORMAT_VERSION,
  EVAL_DASHBOARD_CACHE_STORAGE_KEY,
  evalDashboardCacheKey,
  getLatestEvalDashboardEntry,
  loadEvalDashboardCache,
  MAX_EVAL_DASHBOARD_CACHE_ENTRIES,
  normalizeEvalDashboardCache,
  saveEvalDashboardCache,
  touchEvalDashboardCacheEntry,
  type EvalDashboardCache,
} from "../../web/src/utils/evalDashboardCache.js";

function completed(targetSessionId: string, runId: string, html = runId) {
  return {
    type: "eval_dashboard" as const,
    status: "completed" as const,
    targetSessionId,
    runId,
    html: `<html>${html}</html>`,
    generatedAt: 100,
  };
}

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("Eval Dashboard cache", () => {
  it("isolates Eval entries and retains multiple runs for one target", () => {
    const storage = new MemoryStorage();
    storage.setItem("dscode-dash-cache", JSON.stringify({
      sessionA: createDashboardCacheEntry("hash", "<html>session</html>"),
    }));

    let cache: EvalDashboardCache = {};
    cache = cacheCompletedEvalDashboard(cache, completed("target-A", "run-1"), 1);
    cache = cacheCompletedEvalDashboard(cache, completed("target-A", "run-2"), 2);
    saveEvalDashboardCache(cache, storage);

    expect(Object.keys(cache).sort()).toEqual([
      evalDashboardCacheKey("target-A", "run-1"),
      evalDashboardCacheKey("target-A", "run-2"),
    ].sort());
    expect(cache["target-A:run-1"].html).toBe("<html>run-1</html>");
    expect(cache["target-A:run-2"].html).toBe("<html>run-2</html>");
    expect(storage.getItem("dscode-dash-cache")).toContain("<html>session</html>");
    expect(storage.getItem(EVAL_DASHBOARD_CACHE_STORAGE_KEY)).toContain("run-2");
  });

  it("keeps run HTML immutable and only changes access time", () => {
    let cache = cacheCompletedEvalDashboard(
      {},
      completed("target-A", "run-1", "original"),
      1,
    );
    cache = cacheCompletedEvalDashboard(
      cache,
      completed("target-A", "run-1", "replacement"),
      2,
    );

    expect(cache["target-A:run-1"]).toMatchObject({
      html: "<html>original</html>",
      accessedAt: 2,
    });
  });

  it("evicts the least recently accessed report at five entries", () => {
    let cache: EvalDashboardCache = {};
    for (let index = 1; index <= MAX_EVAL_DASHBOARD_CACHE_ENTRIES; index++) {
      cache = cacheCompletedEvalDashboard(
        cache,
        completed("target", `run-${index}`),
        index,
      );
    }
    cache = touchEvalDashboardCacheEntry(cache, "target", "run-1", 10);
    cache = cacheCompletedEvalDashboard(
      cache,
      completed("target", "run-6"),
      11,
    );

    expect(Object.keys(cache)).toHaveLength(5);
    expect(cache["target:run-1"]).toBeDefined();
    expect(cache["target:run-2"]).toBeUndefined();
    expect(cache["target:run-6"]).toBeDefined();
  });

  it("normalizes corrupt versions and restores the latest valid artifact", () => {
    const valid = cacheCompletedEvalDashboard(
      {},
      completed("target", "valid"),
      5,
    );
    const normalized = normalizeEvalDashboardCache({
      ...valid,
      "target:old": {
        formatVersion: EVAL_DASHBOARD_CACHE_FORMAT_VERSION - 1,
        targetSessionId: "target",
        runId: "old",
        generatedAt: 1,
        html: "<html>old</html>",
        accessedAt: 9,
      },
      "wrong-key": {
        formatVersion: EVAL_DASHBOARD_CACHE_FORMAT_VERSION,
        targetSessionId: "target",
        runId: "mismatch",
        generatedAt: 1,
        html: "<html>wrong</html>",
        accessedAt: 10,
      },
    });

    expect(Object.keys(normalized)).toEqual(["target:valid"]);
    expect(getLatestEvalDashboardEntry(normalized)?.runId).toBe("valid");

    const storage = new MemoryStorage();
    storage.setItem(EVAL_DASHBOARD_CACHE_STORAGE_KEY, JSON.stringify(normalized));
    expect(loadEvalDashboardCache(storage)).toEqual(normalized);
  });

  it("preserves the Session Dashboard 20-entry cache behavior", () => {
    let sessionCache = {};
    for (let index = 1; index <= MAX_DASHBOARD_CACHE_ENTRIES + 1; index++) {
      sessionCache = cacheDashboardEntry(
        sessionCache,
        `session-${index}`,
        createDashboardCacheEntry(`hash-${index}`, `<html>${index}</html>`),
      );
    }

    expect(Object.keys(sessionCache)).toHaveLength(20);
    expect(sessionCache).not.toHaveProperty("session-1");
    expect(sessionCache).toHaveProperty("session-21");
  });
});
