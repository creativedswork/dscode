import type { StreamFn } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TaskState } from "../../../src/agents/process/task-state.js";
import { runWithExecutionContext } from "../../../src/kernel/execution-context.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";
import { assistant, installApprovedPlan } from "./harness-execution-helpers.js";

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

describe("plan_start_item TaskState guard", () => {
  it("rejects missing or mismatched TaskState before binding and accepts an exact match", async () => {
    const streamFn: StreamFn = vi.fn(() =>
      assistant([{ type: "text", text: "unused" }], "stop")
    );
    const fixture = await createRoutedHarnessFixture({ streamFn });
    fixtures.push(fixture);
    const installed = await installApprovedPlan(fixture);
    const main = fixture.harness.agentSupervisor.list().find((process) =>
      process.role === "main"
    );
    const startItem = fixture.drivers.get("plan-execution")?.tools.find((tool) =>
      tool.name === "plan_start_item"
    );
    if (!main || !startItem) throw new Error("Plan execution fixture is incomplete");
    const params = {
      planId: installed.approved.planId,
      expectedVersion: installed.approved.version,
      revision: installed.approved.revision,
      digest: installed.approved.digest,
      itemId: "item-1",
    };
    const bindItem = vi.spyOn(
      fixture.harness["plannerCoordinator"].execution,
      "bindItem",
    );
    const execute = () => runWithExecutionContext({
      hostId: "test",
      processId: main.agentId,
      sessionId: main.parentSessionId,
      application: "main",
      cwd: fixture.root,
    }, () => startItem.execute("start-item", params));
    const matchingTaskState: TaskState = {
      taskId: "task-1",
      requestId: "request-1",
      sessionId: main.parentSessionId,
      version: 1,
      status: "active",
      sourcePlan: {
        planId: params.planId,
        revision: params.revision,
        digest: params.digest,
      },
      todoList: [{
        todoId: "outcome-1",
        title: "User-visible outcome",
        status: "pending",
      }],
      history: [],
      updatedAt: 1,
    };
    const invalidStates: Array<TaskState | undefined> = [
      undefined,
      { ...matchingTaskState, sessionId: "other-session" },
      { ...matchingTaskState, status: "completed" },
      { ...matchingTaskState, sourcePlan: undefined },
      {
        ...matchingTaskState,
        sourcePlan: { ...matchingTaskState.sourcePlan!, planId: "other-plan" },
      },
      {
        ...matchingTaskState,
        sourcePlan: { ...matchingTaskState.sourcePlan!, revision: params.revision + 1 },
      },
      {
        ...matchingTaskState,
        sourcePlan: { ...matchingTaskState.sourcePlan!, digest: "f".repeat(64) },
      },
    ];

    for (const taskState of invalidStates) {
      main.context = Object.freeze({ ...main.context, taskState });
      await expect(execute()).rejects.toThrow(/task_update initialize first/);
      const unchanged = await installed.store.load(params.planId);
      expect(unchanged.ok && unchanged.plan).toMatchObject({
        version: installed.approved.version,
        status: "approved",
      });
    }
    expect(bindItem).not.toHaveBeenCalled();

    main.context = Object.freeze({
      ...main.context,
      taskState: matchingTaskState,
    });
    await expect(execute()).resolves.toMatchObject({
      details: { status: "executing" },
    });
    expect(bindItem).toHaveBeenCalledTimes(1);
  });
});
