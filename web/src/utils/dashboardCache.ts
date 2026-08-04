export const DASHBOARD_CACHE_FORMAT_VERSION = 2;

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
