import {
  getExecutionContext,
  getHostFacility,
} from "../kernel/execution-context.js";

interface InvalidationEvent {
  filePath: string;
  lineCount: number;
  fileVersion: string;
}

export const ANCHOR_INVALIDATION_FACILITY = Symbol(
  "dscode.anchor-invalidations",
);

export class AnchorInvalidationStore {
  private readonly pending = new Map<string, InvalidationEvent[]>();

  record(
    processId: string,
    filePath: string,
    lineCount: number,
    fileVersion: string,
  ): void {
    const pending = this.pending.get(processId) ?? [];
    const existing = pending.findIndex((event) =>
      event.filePath === filePath
    );
    const event = { filePath, lineCount, fileVersion };
    if (existing >= 0) pending[existing] = event;
    else pending.push(event);
    this.pending.set(processId, pending);
  }

  consume(processId: string): string | null {
    const events = this.pending.get(processId);
    if (!events || events.length === 0) return null;
    this.pending.delete(processId);
    return [
      "⚠️  ANCHOR INVALIDATION NOTICE — The following file(s) were fully rewritten:",
      ...events.map((event) =>
        `  • ${event.filePath} (${event.lineCount} lines, fv: ${event.fileVersion})`
      ),
      "ALL previous hash anchors for these files are INVALID.",
      "Before calling edit on any of these files, you MUST run:",
      events.map((event) =>
        `  read_file({ path: "${event.filePath}", hashes: true })`
      ).join("\n"),
    ].join("\n");
  }

  clear(processId?: string): void {
    if (processId) this.pending.delete(processId);
    else this.pending.clear();
  }
}

function currentStore(): AnchorInvalidationStore | undefined {
  return getHostFacility<AnchorInvalidationStore>(
    ANCHOR_INVALIDATION_FACILITY,
  );
}

export function recordInvalidation(
  filePath: string,
  lineCount: number,
  fileVersion: string,
): void {
  const context = getExecutionContext();
  if (!context) return;
  currentStore()?.record(context.processId, filePath, lineCount, fileVersion);
}

export function consumePendingNotices(): string | null {
  const context = getExecutionContext();
  return context
    ? currentStore()?.consume(context.processId) ?? null
    : null;
}

export function clearPendingEvents(): void {
  currentStore()?.clear(getExecutionContext()?.processId);
}
