import { access, readFile, writeFile } from "node:fs/promises";
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

describe("Harness approved Plan execution", () => {
  it("executes a scoped tool through Plan guard and normal permission", async () => {
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
          id: "write-result",
          name: "test_write",
          arguments: { path: "result.txt", content: "approved\n" },
        }], "toolUse");
      }
      if (turn === 3) {
        return assistant([{
          type: "toolCall",
          id: "verify-result",
          name: "verify_item",
          arguments: {
            planId: "plan-1",
            expectedVersion: plan!.approved.version + 2,
            commandId: "verify-result",
            revision: plan!.approved.revision,
            digest: plan!.approved.digest,
            itemId: "item-1",
            criteria: [{
              criterionId: "file-created",
              passed: true,
              evidenceIds: ["tool-write-result"],
              observed: { matched: true, description: "result.txt was written" },
            }],
          },
        }], "toolUse");
      }
      return assistant([{ type: "text", text: "done" }], "stop");
    });
    let fixture!: RoutedHarnessFixture;
    fixture = await createRoutedHarnessFixture({
      streamFn,
      configureDrivers: (drivers) => drivers.register({
        name: "execution-test",
        description: "Plan execution test tool",
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

    await fixture.harness.api.conversation.prompt("execute approved plan");

    await expect(readFile(join(fixture.root, "result.txt"), "utf8"))
      .resolves.toBe("approved\n");
    const loaded = await plan.store.load("plan-1");
    expect(loaded.ok && loaded.plan?.items[0]).toMatchObject({
      status: "completed",
      evidence: [expect.objectContaining({
        kind: "tool_result",
        toolCallId: "write-result",
        acceptanceEligible: true,
      })],
    });
    const main = fixture.harness.agentSupervisor.list().find((item) => item.role === "main");
    expect(main?.context.activePlan).toBeUndefined();
    expect(main?.context.planBinding).toBeUndefined();
  });

  it("releases authorization after a real permission denial and replans", async () => {
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
          id: "denied-write",
          name: "test_write",
          arguments: { path: "denied.txt", content: "must not exist" },
        }], "toolUse");
      }
      if (turn === 3) {
        return assistant([{
          type: "toolCall",
          id: "report-conflict",
          name: "plan_report_conflict",
          arguments: {
            planId: "plan-1",
            expectedVersion: plan!.approved.version + 1,
            commandId: "material-conflict",
            summary: "Denied permission requires a different path",
          },
        }], "toolUse");
      }
      return assistant([{ type: "text", text: "planner stopped" }], "stop");
    });
    let fixture!: RoutedHarnessFixture;
    fixture = await createRoutedHarnessFixture({
      streamFn,
      permissions: { defaultDecision: "deny", rules: [], denyPatterns: [] },
      configureDrivers: (drivers) => drivers.register({
        name: "denied-execution-test",
        description: "Denied Plan execution test tool",
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
            return { content: [{ type: "text", text: "written" }], details: { ok: true } };
          },
        }],
      }),
    });
    fixtures.push(fixture);
    plan = await installApprovedPlan(fixture);

    await fixture.harness.api.conversation.prompt("deny then replan");
    await expect(access(join(fixture.root, "denied.txt"))).rejects.toThrow();
    await vi.waitFor(() => {
      expect(fixture.harness.agentSupervisor.list().some((process) =>
        process.application.name === "planner"
      )).toBe(true);
    });
  });
});
