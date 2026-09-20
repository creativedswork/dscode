import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PlanRetentionService,
  PlanStore,
} from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("terminal Plan recovery retention", () => {
  it.each(["completed", "cancelled", "failed"] as const)(
    "deletes the entire expired %s Plan while retaining active Plans and receipts",
    async (terminalStatus) => {
      const root = await mkdtemp(join(tmpdir(), "dscode-plan-retention-"));
      roots.push(root);
      let now = 100;
      const store = new PlanStore({
        dataDir: root,
        projectPath: "/project",
        now: () => now,
      });
      const terminalInput = makePlanInput(`terminal-${terminalStatus}`);
      const activeInput = makePlanInput(`active-${terminalStatus}`);
      const terminal = await store.create(terminalInput);
      const active = await store.create(activeInput);
      if (!terminal.ok || !active.ok) throw new Error("Plan creation failed");
      const receipted = await store.applyCommand({
        planId: terminal.plan.planId,
        expectedVersion: terminal.plan.version,
        commandId: "receipt-before-terminal",
        operation: "test_receipt",
        payload: { keep: true },
      }, () => {});
      if (!receipted.ok) throw new Error("Receipt setup failed");
      const completed = await store.update(
        terminal.plan.planId,
        receipted.plan.version,
        (draft) => {
          draft.status = terminalStatus;
        },
      );
      if (!completed.ok) throw new Error("Terminal setup failed");
      const retention = new PlanRetentionService(store, 1_000, () => now);

      now = completed.plan.updatedAt + 999;
      await expect(retention.pruneExpiredTerminalPlans()).resolves.toEqual([]);
      await expect(store.load(completed.plan.planId)).resolves.toMatchObject({
        ok: true,
        plan: {
          commandReceipts: [{ commandId: "receipt-before-terminal" }],
        },
      });

      now++;
      await expect(retention.pruneExpiredTerminalPlans()).resolves
        .toEqual([completed.plan.planId]);
      await expect(access(store.planPath(completed.plan.planId))).rejects
        .toMatchObject({ code: "ENOENT" });
      await expect(store.load(active.plan.planId)).resolves.toMatchObject({
        ok: true,
        plan: { status: "drafting" },
      });
    },
  );

  it("rejects an invalid TTL configuration", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-retention-"));
    roots.push(root);
    const store = new PlanStore({ dataDir: root, projectPath: "/project" });

    expect(() => new PlanRetentionService(store, -1)).toThrow(
      "Terminal Plan recovery TTL must be a non-negative number",
    );
  });
});
