import { readdir } from "node:fs/promises";

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanStore } from "../../../src/application/plan/index.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";

const plannerStream = vi.hoisted(() => vi.fn<StreamFn>());
vi.mock("../../../src/models/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import(
    "../../../src/models/index.js"
  )>();
  return {
    ...actual,
    streamSimple: (...args: Parameters<StreamFn>) => plannerStream(...args),
  };
});

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  plannerStream.mockReset();
});

function assistant(
  text: string,
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason,
    timestamp: Date.now(),
  };
}

function completedStream(text = "finished without approval") {
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "done", reason: "stop", message: assistant(text, "stop") });
  return stream;
}

function failedStream(message = "planner model failed") {
  const stream = createAssistantMessageEventStream();
  stream.push({
    type: "error",
    reason: "error",
    error: assistant(message, "error"),
  });
  return stream;
}

async function fixture(streamFn: StreamFn): Promise<RoutedHarnessFixture> {
  plannerStream.mockImplementation(streamFn);
  const created = await createRoutedHarnessFixture({
    streamFn: () => completedStream("unexpected Main call"),
  });
  fixtures.push(created);
  return created;
}

async function loadOnlyPlan(created: RoutedHarnessFixture) {
  const store = new PlanStore({
    dataDir: `${created.root}/data`,
    projectPath: created.root,
  });
  const files = await readdir(store.directoryPath);
  const planId = files.find((name) => name.endsWith(".json"))?.slice(0, -5);
  if (!planId) throw new Error("Plan file missing");
  const loaded = await store.load(planId);
  if (!loaded.ok || !loaded.plan) throw new Error("Plan record missing");
  return loaded.plan;
}

async function expectMainRestored(created: RoutedHarnessFixture) {
  await vi.waitFor(() => {
    const main = created.harness.agentSupervisor.list().find(
      (process) => process.role === "main",
    );
    expect(main?.state).toBe("running");
    expect(created.harness.agentSupervisor.foreground(main!.parentSessionId)?.agentId)
      .toBe(main?.agentId);
  }, { timeout: 7_000 });
}

describe("Harness Planner exit cleanup", () => {
  it("fails an unapproved Plan after normal model exit", async () => {
    const created = await fixture(() => completedStream());
    await created.harness.api.conversation.prompt("plan normally", undefined, "plan");
    await expectMainRestored(created);
    const plan = await loadOnlyPlan(created);
    expect(plan.status).toBe("failed");
    expect(plan.trajectoryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "fact_recorded",
        summary: "Planner exited before approval",
      }),
    ]));
  });

  it("persists a public failure after a Planner model error", async () => {
    const created = await fixture(() => failedStream());
    await created.harness.api.conversation.prompt("plan failure", undefined, "plan");
    await expectMainRestored(created);
    const plan = await loadOnlyPlan(created);
    expect(plan.status).toBe("failed");
    expect(plan.trajectoryEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "fact_recorded",
        summary: expect.stringContaining("Agent model request failed"),
      }),
    ]));
  });

  it("cancels the Plan when Harness aborts the Planner", async () => {
    let finishAbort = () => {};
    const streamFn: StreamFn = vi.fn(() => {
      const stream = createAssistantMessageEventStream();
      finishAbort = () => {
        stream.push({
          type: "error",
          reason: "aborted",
          error: assistant("aborted", "aborted"),
        });
      };
      return stream;
    });
    const created = await fixture(streamFn);
    await created.harness.api.conversation.prompt("plan abort", undefined, "plan");
    await vi.waitFor(() => {
      expect(plannerStream).toHaveBeenCalled();
    });
    created.harness.api.conversation.abort();
    finishAbort();
    await expectMainRestored(created);
    expect((await loadOnlyPlan(created)).status).toBe("cancelled");
  });
});
