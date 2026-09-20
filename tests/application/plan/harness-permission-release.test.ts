import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { StreamFn } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";
import {
  assistant,
  installApprovedPlan,
} from "./harness-execution-helpers.js";

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe("Harness Plan permission release", () => {
  it("releases an accepted Plan authorization when permission prompting throws", async () => {
    let plan: Awaited<ReturnType<typeof installApprovedPlan>> | undefined;
    let turn = 0;
    const streamFn: StreamFn = vi.fn(() => {
      turn++;
      if (turn === 1) {
        return assistant([{
          type: "toolCall",
          id: "start-item",
          name: "plan_start_item",
          arguments: {
            planId: "plan-1",
            expectedVersion: plan!.approved.version,
            revision: plan!.approved.revision,
            digest: plan!.approved.digest,
            itemId: "item-1",
          },
        }], "toolUse");
      }
      if (turn === 2) {
        return assistant([{
          type: "toolCall",
          id: "permission-throws",
          name: "test_write",
          arguments: { path: "result.txt", content: "must not exist" },
        }], "toolUse");
      }
      return assistant([{ type: "text", text: "stopped" }], "stop");
    });
    const requestPermission = vi.fn(async () => {
      throw new Error("permission transport failed");
    });
    let fixture!: RoutedHarnessFixture;
    fixture = await createRoutedHarnessFixture({
      streamFn,
      permissions: { defaultDecision: "ask", rules: [], denyPatterns: [] },
      requestPermission,
      configureDrivers: (drivers) => drivers.register({
        name: "permission-throw-test",
        description: "Permission throw test tool",
        source: "builtin",
        tools: [{
          name: "test_write",
          label: "Write result",
          description: "Write the result file",
          effect: "workspace_write",
          parameters: Type.Object({
            path: Type.String(),
            content: Type.String(),
          }, { additionalProperties: false }),
          execute: async (_id, args) => {
            const input = args as { path: string; content: string };
            await writeFile(join(fixture.root, input.path), input.content);
            return {
              content: [{ type: "text", text: "written" }],
              details: { ok: true },
            };
          },
        }],
      }),
    });
    fixtures.push(fixture);
    plan = await installApprovedPlan(fixture);

    await fixture.harness.api.conversation.prompt("permission throws").catch(() => {});
    expect(requestPermission).toHaveBeenCalledOnce();
    await expect(access(join(fixture.root, "result.txt"))).rejects.toThrow();
    const current = await plan.store.load("plan-1");
    if (!current.ok || !current.plan) throw new Error("Plan missing");
    await expect(fixture.harness["plannerCoordinator"].execution.cancel({
      planId: "plan-1",
      expectedVersion: current.plan.version,
      commandId: "cancel-after-permission-throw",
    })).resolves.toMatchObject({
      ok: true,
      plan: { status: "cancelled" },
    });
  });
});
