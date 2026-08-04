export const DASHBOARD_CACHE_FORMAT_VERSION = 2;
export const MAX_DASHBOARD_CACHE_ENTRIES = 20;

export interface DashboardCacheEntry {
  contentHash: string;
  html: string;
  formatVersion?: number;
}

export function createDashboardCacheEntry(
  contentHash: string,
  html: string,
): DashboardCacheEntry {
  return {
    contentHash,
    html,
    formatVersion: DASHBOARD_CACHE_FORMAT_VERSION,
  };
}

export function isDashboardCacheEntryValid(
  entry: DashboardCacheEntry | undefined,
  contentHash: string | undefined,
): entry is DashboardCacheEntry {
  return !!entry
    && !!contentHash
    && entry.contentHash === contentHash
    && entry.formatVersion === DASHBOARD_CACHE_FORMAT_VERSION;
}

export function cacheDashboardEntry(
  cache: Record<string, DashboardCacheEntry>,
  sessionId: string,
  entry: DashboardCacheEntry,
): Record<string, DashboardCacheEntry> {
  const next = { ...cache };
  const entries = Object.keys(next);
  if (entries.length >= MAX_DASHBOARD_CACHE_ENTRIES && !next[sessionId]) {
    delete next[entries[0]];
  }
  next[sessionId] = entry;
  return next;
}
