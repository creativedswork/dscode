/**
 * Anchor Invalidation Store (S2b).
 *
 * When write_file/overwrite_file rewrites a file, all previous hash anchors
 * become stale. This store tracks those events and provides a mechanism to
 * inject notices into the next conversation turn.
 *
 * Design constraint: notices are injected into the conversation layer
 * (as user turn prefix messages), NOT into the system prompt. This preserves
 * LLM API prompt prefix caching by keeping the system prompt static.
 */

interface InvalidationEvent {
  filePath: string;
  lineCount: number;
  fileVersion: string;
}

let pendingEvents: InvalidationEvent[] = [];

/**
 * Record that a file was fully rewritten, invalidating all its anchors.
 */
export function recordInvalidation(
  filePath: string,
  lineCount: number,
  fileVersion: string,
): void {
  // Deduplicate: if the same file is already pending, replace with latest
  const existing = pendingEvents.findIndex(e => e.filePath === filePath);
  if (existing >= 0) {
    pendingEvents[existing] = { filePath, lineCount, fileVersion };
  } else {
    pendingEvents.push({ filePath, lineCount, fileVersion });
  }
}

/**
 * Consume all pending invalidation events and return a notice string
 * to inject into the conversation. Returns null if no events are pending.
 * Events are cleared after consumption (one-shot delivery).
 */
export function consumePendingNotices(): string | null {
  if (pendingEvents.length === 0) return null;

  const parts: string[] = [];
  parts.push("⚠️  ANCHOR INVALIDATION NOTICE — The following file(s) were fully rewritten:");

  for (const event of pendingEvents) {
    parts.push(
      `  • ${event.filePath} (${event.lineCount} lines, fv: ${event.fileVersion})`
    );
  }

  parts.push(
    "ALL previous hash anchors for these files are INVALID.",
    "Before calling edit on any of these files, you MUST run:",
    pendingEvents.map(e => `  read_file({ path: "${e.filePath}", hashes: true })`).join("\n"),
  );

  pendingEvents = [];
  return parts.join("\n");
}

/** Clear all pending events without consuming (for testing/cleanup). */
export function clearPendingEvents(): void {
  pendingEvents = [];
}
