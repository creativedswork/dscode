import {
  createAssistantMessageEventStream,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindPlanItemToAgent,
  type PlanService,
} from "../../../src/application/plan/index.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";
import { makePlanInput } from "./helpers.js";

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

function completedStream(text: string) {
  const message: AssistantMessage = {
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
    stopReason: "stop",
    timestamp: Date.now(),
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "done", reason: "stop", message });
  return stream;
}

describe("Harness Plan continuation", () => {
  it("keeps the same processing turn alive while the Plan remains incomplete", async () => {
    const streamFn: StreamFn = vi.fn(() =>
      completedStream("premature completion")
    );
    const fixture = await createRoutedHarnessFixture({ streamFn });
    fixtures.push(fixture);
    const { harness } = fixture;
    const main = harness.agentSupervisor.list().find((process) =>
      process.role === "main"
    );
    const sessionId = harness.api.sessions.currentId();
    if (!main || !sessionId) throw new Error("Main Session is unavailable");
    const service = harness["planService"] as PlanService;
    const input = makePlanInput("plan-continuation");
    input.sessionId = sessionId;
    input.mainAgentId = main.agentId;
    const created = await service.create(input);
    if (!created.ok) throw new Error("Plan create failed");
    const compiled = await service.execution.compile(
      input.planId,
      input.plannerAgentId!,
      created.plan.version,
      {
        items: [{
          itemId: "item-1",
          title: "Complete the item",
          description: "Exercise host continuation",
          dependsOn: [],
          acceptanceCriteria: [{
            kind: "observable",
            criterionId: "observed",
            description: "The item is complete",
          }],
          effectGrants: [],
        }],
        sideEffectSummary: "No side effects.",
      },
    );
    if (!compiled.ok) throw new Error("Plan compile failed");
    const waiting = await service.requestApproval(
      input.planId,
      input.plannerAgentId!,
      compiled.plan.version,
      "approval-continuation",
    );
    const pending = waiting.pendingInteraction;
    if (!pending) throw new Error("Approval interaction missing");
    const approved = await service.approve({
      planId: input.planId,
      expectedVersion: waiting.version,
      commandId: "approve-continuation",
      interactionId: pending.interactionId,
      interactionPayloadDigest: pending.payloadDigest,
      revision: waiting.revision,
      digest: waiting.digest,
      acknowledgedEffects: [],
    });
    if (!approved.ok) throw new Error("Plan approval failed");
    const bound = await service.execution.bindItem({
      planId: approved.plan.planId,
      expectedVersion: approved.plan.version,
      revision: approved.plan.revision,
      digest: approved.plan.digest,
      itemId: "item-1",
      agentId: main.agentId,
      role: "main",
    });
    if (!bound.ok) throw new Error("Plan item binding failed");
    const binding = bound.plan.items[0]?.executionBindings?.[0];
    if (!binding) throw new Error("Plan item binding missing");
    bindPlanItemToAgent(main, binding);
    const warnings: string[] = [];
    harness.events.on("ui:warning", (event) => warnings.push(event.text));

    await harness["resumeApprovedPlan"](bound.plan);

    expect(streamFn).toHaveBeenCalledTimes(3);
    expect(warnings).toContain(
      "执行未能继续，未完成的 TODO 已保留并标记为阻塞。",
    );
    await expect(service.load(input.planId)).resolves.toMatchObject({
      ok: true,
      plan: {
        status: "executing",
        items: [{ status: "blocked" }],
      },
    });
  });
});
