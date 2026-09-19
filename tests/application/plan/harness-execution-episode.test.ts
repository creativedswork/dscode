import type { StreamFn } from "@earendil-works/pi-agent-core";
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

describe("Harness execution episodes", () => {
  it("reflects once then pauses repeated actions without changing outcomes", async () => {
    let fixture!: RoutedHarnessFixture;
    let installed: Awaited<ReturnType<typeof installApprovedPlan>>;
    let turn = 0;
    const streamFn: StreamFn = vi.fn(() => {
      turn++;
      if (turn === 1) {
        return assistant([{
          type: "toolCall",
          id: "start-task",
          name: "task_update",
          arguments: {
            operation: "transition",
            expectedVersion: 1,
            todoId: "outcome-1",
            status: "in_progress",
          },
        }], "toolUse");
      }
      if (turn === 2) {
        return assistant([{
          type: "toolCall",
          id: "start-plan",
          name: "plan_start_item",
          arguments: {
            planId: installed.approved.planId,
            expectedVersion: installed.approved.version,
            revision: installed.approved.revision,
            digest: installed.approved.digest,
            itemId: "item-1",
          },
        }], "toolUse");
      }
      return assistant([{
        type: "toolCall",
        id: `repeat-${turn}`,
        name: "read_file",
        arguments: { path: `${fixture.root}/missing.txt` },
      }], "toolUse");
    });
    fixture = await createRoutedHarnessFixture({ streamFn });
    fixtures.push(fixture);
    installed = await installApprovedPlan(fixture);
    const phases: string[] = [];
    const impasses: string[] = [];
    fixture.harness.events.on("plan:episode", (event) => {
      if (phases.at(-1) !== event.episode.phase) phases.push(event.episode.phase);
    });
    fixture.harness.events.on("plan:impasse", (event) => {
      impasses.push(event.incident.rule);
    });

    await fixture.harness["resumeApprovedPlan"](installed.approved);

    expect(turn).toBe(8);
    expect(phases).toEqual([
      "running",
      "reflecting",
      "paused_inconclusive",
    ]);
    expect(impasses).toEqual([
      "max_equivalent_actions",
      "max_equivalent_actions",
    ]);
    const loaded = await installed.store.load(installed.approved.planId);
    expect(loaded).toMatchObject({
      ok: true,
      plan: {
        status: "executing",
        revision: installed.approved.revision,
        digest: installed.approved.digest,
        execution: {
          steps: [{ status: "in_progress", evidence: [] }],
          episode: {
            phase: "paused_inconclusive",
            reflectionUsed: true,
          },
        },
      },
    });
    const sessionId = fixture.harness.api.sessions.currentId();
    expect(sessionId).toBeDefined();
    expect(await fixture.harness.api.tasks.getTaskState(sessionId!)).toMatchObject({
      version: 2,
      status: "active",
      todoList: [{ status: "in_progress" }],
    });
  });
});
