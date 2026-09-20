import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ExecutiveMonitor,
  fingerprintExecutionAction,
  hasExecutionProgress,
  startExecutionEpisode,
  type ExecutionEpisodePolicy,
  type ExecutionProgressSnapshot,
} from "../../../src/application/plan/index.js";

const policy: ExecutionEpisodePolicy = {
  maxTurns: 2,
  maxToolCalls: 4,
  maxNoProgressActions: 3,
  maxEquivalentActions: 2,
  reflectionMaxTurns: 1,
  reflectionMaxToolCalls: 2,
};

function progress(
  stepStatus: "pending" | "in_progress" | "completed" = "in_progress",
  todoStatus: "pending" | "in_progress" | "completed" = "in_progress",
): ExecutionProgressSnapshot {
  return {
    passedVerificationIds: [],
    planSteps: [{ stepId: "step-1", status: stepStatus }],
    task: {
      status: todoStatus === "completed" ? "completed" : "active",
      todos: [{ todoId: "todo-1", status: todoStatus }],
    },
  };
}

function monitor(): ExecutiveMonitor {
  return new ExecutiveMonitor(startExecutionEpisode({
    episodeId: "episode-1",
    planId: "plan-1",
    planRevision: 1,
    planDigest: "a".repeat(64),
    sessionId: "session-1",
    mainAgentId: "main-1",
    progress: progress(),
  }, 1, policy), () => 2);
}

describe("execution progress", () => {
  it("recognizes only verification, step, and TaskState outcome changes", () => {
    const initial = progress();
    expect(hasExecutionProgress(initial, {
      ...initial,
      passedVerificationIds: ["verify-1"],
    })).toBe(true);
    expect(hasExecutionProgress(initial, progress("completed"))).toBe(true);
    expect(hasExecutionProgress(initial, progress("in_progress", "completed")))
      .toBe(true);

    const reordered: ExecutionProgressSnapshot = {
      ...initial,
      planSteps: [...initial.planSteps].reverse(),
      task: {
        ...initial.task!,
        todos: initial.task!.todos.map((todo) => ({
          ...todo,
          title: "ignored",
        })) as typeof initial.task.todos,
      },
    };
    expect(hasExecutionProgress(initial, reordered)).toBe(false);
  });
});

describe("execution action fingerprints", () => {
  it("normalizes filesystem edits and excludes volatile fields", () => {
    const first = fingerprintExecutionAction("edit_file", {
      path: "src/plan/../plan/types.ts",
      old_string: "const   value = 1;",
      new_string: "const value = 2;",
      callId: "call-1",
      timestamp: 1,
    }, "succeeded");
    const second = fingerprintExecutionAction("EDIT_FILE", {
      path: "src/plan/types.ts",
      old_string: "const value = 1;",
      new_string: "const  value = 2;",
      callId: "call-2",
      timestamp: 2,
    }, "succeeded");
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(
      fingerprintExecutionAction("edit_file", {
        path: "src/plan/types.ts",
        old_string: "const value = 1;",
        new_string: "const value = 2;",
      }, "failed").fingerprint,
    ).not.toBe(first.fingerprint);
  });

  it("normalizes commands and generic JSON", () => {
    expect(fingerprintExecutionAction("bash", {
      command: "npm   test",
      cwd: "src/../",
      requestId: "one",
    }, "succeeded").fingerprint).toBe(
      fingerprintExecutionAction("bash", {
        command: "npm test",
        cwd: ".",
        requestId: "two",
      }, "succeeded").fingerprint,
    );
    expect(fingerprintExecutionAction("custom", {
      z: " value ",
      evidenceId: "one",
      nested: { b: 2, a: 1 },
    }, "inconclusive").fingerprint).toBe(
      fingerprintExecutionAction("custom", {
        nested: { a: 1, b: 2 },
        z: "value",
        evidenceId: "two",
      }, "inconclusive").fingerprint,
    );
  });
});

describe("ExecutiveMonitor", () => {
  it("stops the sanitized production incident before 22 equivalent edits", () => {
    const fixture = JSON.parse(readFileSync(new URL(
      "../../fixtures/execution-incident-00MU6UD8KVT6VVQN5OHHN4D3YY.json",
      import.meta.url,
    ), "utf8"));
    const executive = new ExecutiveMonitor(startExecutionEpisode({
      episodeId: "incident-replay",
      planId: "plan-1",
      planRevision: 1,
      planDigest: "a".repeat(64),
      sessionId: fixture.sourceSessionId,
      mainAgentId: "main-1",
      progress: fixture.unchangedProgress,
    }, 1), () => 2);
    const action = fingerprintExecutionAction(
      fixture.action.toolName,
      fixture.action.arguments,
      fixture.action.outcomeClass,
    );
    const phases: string[] = [];
    let executed = 0;
    while (executed < fixture.observedEquivalentEditCount) {
      executed++;
      const observation = executive.recordAction(
        action,
        fixture.unchangedProgress,
      );
      if (phases.at(-1) !== observation.episode.phase) {
        phases.push(observation.episode.phase);
      }
      if (observation.episode.phase === "paused_inconclusive") break;
    }

    expect(executed).toBe(6);
    expect(executed).toBeLessThan(fixture.observedEquivalentEditCount);
    expect(phases).toEqual(["running", "reflecting", "paused_inconclusive"]);
  });

  it("uses one reflection and pauses at the second equivalent-action impasse", () => {
    const executive = monitor();
    const action = fingerprintExecutionAction(
      "edit_file",
      { path: "result.ts", old_string: "a", new_string: "b" },
      "succeeded",
    );

    expect(executive.recordAction(action, progress()).stop).toBe(false);
    const reflection = executive.recordAction(action, progress());
    expect(reflection).toMatchObject({
      stop: true,
      impasse: "max_equivalent_actions",
      episode: {
        phase: "reflecting",
        reflectionUsed: true,
        turnCount: 0,
        toolCallCount: 0,
      },
    });

    expect(executive.recordAction(action, progress()).stop).toBe(false);
    const paused = executive.recordAction(action, progress());
    expect(paused).toMatchObject({
      stop: true,
      episode: {
        phase: "paused_inconclusive",
        incident: { reflectionAvailable: false },
      },
    });
  });

  it("enforces turn budgets and resets no-progress state on progress", () => {
    const executive = monitor();
    expect(executive.recordTurn(progress()).stop).toBe(false);
    expect(executive.recordTurn(progress())).toMatchObject({
      stop: true,
      impasse: "max_turns",
      episode: { phase: "reflecting" },
    });

    const changed = progress("completed");
    const observed = executive.recordAction(
      fingerprintExecutionAction("read_file", { path: "result.ts" }, "succeeded"),
      changed,
    );
    expect(observed.episode).toMatchObject({
      noProgressActionCount: 0,
      recentFingerprints: [],
      progress: changed,
    });
    expect(executive.recordTurn(changed).stop).toBe(false);
    expect(executive.recordTurn(changed)).toMatchObject({
      stop: true,
      impasse: "max_turns",
      episode: { phase: "paused_inconclusive" },
    });
  });

  it("marks completion without inferring it from budget exhaustion", () => {
    const executive = monitor();
    expect(executive.markCompleted(progress("completed", "completed")))
      .toMatchObject({
        stop: true,
        episode: { phase: "completed" },
      });
  });
});
