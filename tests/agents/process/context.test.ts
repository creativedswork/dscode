import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  getExecutionContext,
  resolveExecutionPath,
  runWithExecutionContext,
  type ExecutionContext,
} from "../../../src/kernel/execution-context.js";
import { bashTool } from "../../../src/drivers/shell.js";
import {
  ANCHOR_INVALIDATION_FACILITY,
  AnchorInvalidationStore,
  consumePendingNotices,
  recordInvalidation,
} from "../../../src/context/anchor-invalidation.js";
import { Logger } from "../../../src/utils/logger.js";
import { HostFacilityRegistry } from "../../../src/kernel/host-facilities.js";
import {
  captureUndoSnapshot,
  getUndoSnapshot,
  UNDO_STORE_FACILITY,
  UndoSnapshotStore,
} from "../../../src/drivers/edit/undo-store.js";

const temporaryDirectories: string[] = [];

function context(
  processId: string,
  cwd: string,
  facilities?: HostFacilityRegistry,
): ExecutionContext {
  return {
    hostId: "host-test",
    processId,
    cwd,
    sessionId: "session",
    application: "test",
    facilities,
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true }),
  ));
});

describe("Kernel ExecutionContext AsyncLocalStorage", () => {
  it("keeps concurrent Agent cwd and identity isolated", async () => {
    const first = await mkdtemp(join(tmpdir(), "dscode-agent-a-"));
    const second = await mkdtemp(join(tmpdir(), "dscode-agent-b-"));
    temporaryDirectories.push(first, second);

    const [a, b] = await Promise.all([
      runWithExecutionContext(context("agent-a", first), async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const result = await bashTool.execute("a", { command: "pwd" });
        return {
          path: resolveExecutionPath("file.txt"),
          processId: getExecutionContext()?.processId,
          pwd: (result.content[0] as { text: string }).text.trim(),
        };
      }),
      runWithExecutionContext(context("agent-b", second), async () => {
        const result = await bashTool.execute("b", { command: "pwd" });
        return {
          path: resolveExecutionPath("file.txt"),
          processId: getExecutionContext()?.processId,
          pwd: (result.content[0] as { text: string }).text.trim(),
        };
      }),
    ]);

    expect(a.path).toBe(join(first, "file.txt"));
    expect(a.processId).toBe("agent-a");
    expect(await realpath(a.pwd)).toBe(await realpath(first));
    expect(b.path).toBe(join(second, "file.txt"));
    expect(b.processId).toBe("agent-b");
    expect(await realpath(b.pwd)).toBe(await realpath(second));
    expect(getExecutionContext()).toBeUndefined();
  });

  it("isolates anchor invalidation notices by Agent identity", async () => {
    const facilities = new HostFacilityRegistry().register(
      ANCHOR_INVALIDATION_FACILITY,
      new AnchorInvalidationStore(),
    );
    const first = context("agent-a", "/project-a", facilities);
    const second = context("agent-b", "/project-b", facilities);

    await runWithExecutionContext(first, async () => {
      recordInvalidation("shared.ts", 1, "version-a");
    });
    await runWithExecutionContext(second, async () => {
      recordInvalidation("shared.ts", 2, "version-b");
    });

    const firstNotice = await runWithExecutionContext(first, async () => consumePendingNotices());
    const secondNotice = await runWithExecutionContext(second, async () => consumePendingNotices());
    expect(firstNotice).toContain("version-a");
    expect(firstNotice).not.toContain("version-b");
    expect(secondNotice).toContain("version-b");
    expect(secondNotice).not.toContain("version-a");
  });

  it("isolates facilities when Process and Session identifiers collide across Hosts", async () => {
    const firstFacilities = new HostFacilityRegistry().register(
      UNDO_STORE_FACILITY,
      new UndoSnapshotStore(),
    );
    const secondFacilities = new HostFacilityRegistry().register(
      UNDO_STORE_FACILITY,
      new UndoSnapshotStore(),
    );
    const first = {
      ...context("main", "/project-a", firstFacilities),
      hostId: "host-a",
    };
    const second = {
      ...context("main", "/project-b", secondFacilities),
      hostId: "host-b",
    };

    await runWithExecutionContext(first, async () => {
      captureUndoSnapshot("shared.ts", "host-a");
    });
    await runWithExecutionContext(second, async () => {
      captureUndoSnapshot("shared.ts", "host-b");
    });

    expect(runWithExecutionContext(
      first,
      () => getUndoSnapshot("shared.ts"),
    )).toBe("host-a");
    expect(runWithExecutionContext(
      second,
      () => getUndoSnapshot("shared.ts"),
    )).toBe("host-b");
  });

  it("uses an explicit fallback when no context is bound", async () => {
    const fallback = await mkdtemp(join(tmpdir(), "dscode-context-fallback-"));
    temporaryDirectories.push(fallback);
    expect(resolveExecutionPath("file.txt", fallback)).toBe(join(fallback, "file.txt"));
  });

  it("rejects forged or incomplete contexts", () => {
    expect(() => runWithExecutionContext(
      { ...context("agent", "/project"), processId: "" },
      () => undefined,
    )).toThrow("ExecutionContext.processId");
    expect(() => runWithExecutionContext(
      { ...context("agent", "/project"), cwd: "relative" },
      () => undefined,
    )).toThrow("ExecutionContext.cwd must be absolute");
  });

  it("adds Host and Process attribution to logs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dscode-context-log-"));
    temporaryDirectories.push(directory);
    const logger = new Logger({ type: "test", id: "fallback", directory });

    runWithExecutionContext(context("agent-log", directory), () => {
      logger.info("Context", "attributed");
    });

    const content = await readFile(join(directory, "dscode.log"), "utf8");
    expect(content).toContain("[test/host-test:agent-log]");
    expect(content).toContain("[Context] attributed");
  });
});
