import {
  createAssistantMessageEventStream,
  Type,
  type AssistantMessage,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindPlanItemToAgent,
  type PlanRecord,
  type PlanService,
} from "../../../src/application/plan/index.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";
import { INTERNAL_PLAN_EXECUTION_VISIBILITY } from "../../../src/kernel/message-visibility.js";
import { rebuildDisplayMessages } from "../../../src/ui/shared/session-projector.js";
import {
  assistant,
  installApprovedPlan,
} from "./harness-execution-helpers.js";
import { makePlanInput } from "./helpers.js";

const fixtures: RoutedHarnessFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

function completedStream(text: string) {
  const message = completedMessage(text);
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "done", reason: "stop", message });
  return stream;
}

function streamedCompletion(text: string) {
  const start = {
    ...completedMessage(""),
    content: [],
  };
  const message = completedMessage(text);
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "start", partial: start });
  stream.push({
    type: "text_start",
    contentIndex: 0,
    partial: { ...start, content: [{ type: "text", text: "" }] },
  });
  stream.push({
    type: "text_delta",
    contentIndex: 0,
    delta: text,
    partial: message,
  });
  stream.push({
    type: "text_end",
    contentIndex: 0,
    content: text,
    partial: message,
  });
  stream.push({ type: "done", reason: "stop", message });
  return stream;
}

function completedMessage(text: string): AssistantMessage {
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
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("Harness Plan continuation", () => {
  it("auto-completes an item when persisted command evidence passes", async () => {
    const streamOptions: (SimpleStreamOptions | undefined)[] = [];
    const streamFn: StreamFn = vi.fn((_model, _context, options) => {
      streamOptions.push(options);
      return completedStream("premature completion");
    });
    const fixture = await createRoutedHarnessFixture({ streamFn });
    fixtures.push(fixture);
    const { harness } = fixture;
    harness.agent.state.thinkingLevel = "high";
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
        executionSteps: [{
          stepId: "item-1",
          title: "Complete the item",
          description: "Exercise host continuation",
          dependsOn: [],
          verifications: [{
            kind: "command",
            verificationId: "command-passed",
            description: "The result exists",
            command: "test -f result.html",
            expect: { exitCode: 0 },
          }],
          effectGrants: [],
        }],
        sideEffectSummary: "Runs the acceptance command.",
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
      acknowledgedEffects: ["process"],
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
    const binding = bound.plan.schemaVersion === 2
      ? bound.plan.execution.steps[0]?.executionBindings?.[0]
      : undefined;
    if (!binding) throw new Error("Plan item binding missing");
    bindPlanItemToAgent(main, binding);
    await service.execution.recordToolResult(
      binding,
      "acceptance-command",
      "bash",
      { command: "test -f result.html" },
      { content: [{ type: "text", text: "(no output)" }], details: { exitCode: 0 } },
      false,
      "process",
    );
    const warnings: string[] = [];
    harness.events.on("ui:warning", (event) => warnings.push(event.text));

    await harness["resumeApprovedPlan"](bound.plan);

    expect(streamFn).not.toHaveBeenCalled();
    expect(streamOptions).toHaveLength(0);
    expect(streamOptions.every((options) => options?.reasoning === undefined))
      .toBe(true);
    expect(harness.agent.state.thinkingLevel).toBe("high");
    expect(warnings).toEqual([]);
    await expect(service.load(input.planId)).resolves.toMatchObject({
      ok: true,
      plan: {
        status: "completed",
        execution: { steps: [{ status: "completed" }] },
      },
    });
  });

  it("keeps intermediate execution narration out of live and replayed Chat", async () => {
    const streamFn: StreamFn = vi.fn(() =>
      streamedCompletion("Verbose internal execution narration")
    );
    const fixture = await createRoutedHarnessFixture({ streamFn });
    fixtures.push(fixture);
    const { harness } = fixture;
    const sessionId = harness.api.sessions.currentId();
    if (!sessionId) throw new Error("Main Session is unavailable");
    const visibleText: string[] = [];
    harness.events.on("llm:text:delta", (event) =>
      visibleText.push(event.delta)
    );

    harness["planContinuation"] = {
      planId: "plan-internal",
      phase: "execution",
      progress: "item-1:in_progress",
      stalledFollowUps: 0,
      totalFollowUps: 0,
    };
    await harness.agent.prompt("Continue the internal Plan");

    expect(visibleText).toEqual([]);
    const internalMessage = harness.agent.state.messages.findLast((message) =>
      message.role === "assistant"
    ) as AssistantMessage & { dscodeVisibility?: string };
    expect(internalMessage.dscodeVisibility).toBe(
      INTERNAL_PLAN_EXECUTION_VISIBILITY,
    );
    const modelMessages = await harness.agent.transformContext?.(
      harness.agent.state.messages,
    );
    expect(modelMessages?.every((message) =>
      !("dscodeVisibility" in message)
    )).toBe(true);
    const replay = rebuildDisplayMessages(
      harness.agent.state.messages,
      [],
      sessionId,
    );
    expect(replay.some((message) =>
      message.content.includes("internal execution narration")
    )).toBe(false);

    const directFixture = await createRoutedHarnessFixture({
      streamFn: () => streamedCompletion("Implementation complete."),
    });
    fixtures.push(directFixture);
    const directText: string[] = [];
    directFixture.harness.events.on("llm:text:delta", (event) =>
      directText.push(event.delta)
    );

    await directFixture.harness.agent.prompt("Report the final result");

    expect(directText).toEqual(["Implementation complete."]);
  });

  it("keeps Main alive and produces one visible report after Plan completion", async () => {
    let installed: Awaited<ReturnType<typeof installApprovedPlan>> | undefined;
    let mainAgentId = "";
    let sessionId = "";
    let turn = 0;
    let executionPrompt = "";
    const completionPromptCounts: number[] = [];
    const activePlanAtTurn: boolean[] = [];
    const deliverResult = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "delivered" }],
      details: { ok: true },
    }));
    const finalReport = [
      "交付结果：成果已完成。",
      "验证：已运行交付检查并通过。",
      "未验证/缺口：无。",
    ].join("\n");
    const streamFn: StreamFn = vi.fn((_model, context) => {
      turn++;
      completionPromptCounts.push(
        (JSON.stringify(context.messages).match(/<plan_completion>/g) ?? []).length,
      );
      activePlanAtTurn.push(Boolean(
        fixture.harness.agentSupervisor.get(mainAgentId)?.context.activePlan,
      ));
      if (turn === 1) {
        const promptContent = context.messages.at(-1)?.content;
        executionPrompt = typeof promptContent === "string"
          ? promptContent
          : Array.isArray(promptContent)
            ? promptContent
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n")
            : "";
        return assistant([{
          type: "toolCall",
          id: "initialize-task",
          name: "task_update",
          arguments: {
            operation: "initialize",
            expectedVersion: 0,
            taskId: "task-final-report",
            requestId: installed!.approved.request.requestId,
            sessionId: installed!.approved.sessionId,
            sourcePlan: {
              planId: installed!.approved.planId,
              revision: installed!.approved.revision,
              digest: installed!.approved.digest,
            },
            todoList: [{
              todoId: "delivered",
              title: "User-visible result is delivered",
            }],
          },
        }], "toolUse");
      }
      if (turn === 2) {
        return assistant([{
          type: "toolCall",
          id: "start-task",
          name: "task_update",
          arguments: {
            operation: "transition",
            expectedVersion: 1,
            todoId: "delivered",
            status: "in_progress",
          },
        }], "toolUse");
      }
      if (turn === 3) {
        return assistant([{
          type: "toolCall",
          id: "start-item",
          name: "plan_start_item",
          arguments: {
            planId: installed!.approved.planId,
            expectedVersion: installed!.approved.version,
            revision: installed!.approved.revision,
            digest: installed!.approved.digest,
            itemId: "item-1",
          },
        }], "toolUse");
      }
      if (turn === 4) {
        return assistant([{
          type: "toolCall",
          id: "deliver-result",
          name: "test_write",
          arguments: { path: "result.txt" },
        }], "toolUse");
      }
      if (turn === 5) {
        return assistant([{
          type: "toolCall",
          id: "late-side-effect",
          name: "test_write",
          arguments: { path: "late.txt" },
        }], "toolUse");
      }
      if (turn === 6) {
        return assistant([{
          type: "toolCall",
          id: "complete-task",
          name: "task_update",
          arguments: {
            operation: "transition",
            expectedVersion: 2,
            todoId: "delivered",
            status: "completed",
            result: "The requested result is available and verified.",
          },
        }], "toolUse");
      }
      return streamedCompletion(finalReport);
    });
    let fixture!: RoutedHarnessFixture;
    fixture = await createRoutedHarnessFixture({
      streamFn,
      configureDrivers: (drivers) => drivers.register({
        name: "final-report-test",
        description: "Completes the authorized observable result",
        source: "builtin",
        tools: [{
          name: "test_write",
          label: "Deliver result",
          description: "Produce the approved observable result",
          effect: "workspace_write",
          parameters: Type.Object({
            path: Type.String(),
          }, { additionalProperties: false }),
          execute: deliverResult,
        }],
      }),
    });
    fixtures.push(fixture);
    const main = fixture.harness.agentSupervisor.list().find((process) =>
      process.role === "main"
    );
    const currentSessionId = fixture.harness.api.sessions.currentId();
    if (!main || !currentSessionId) throw new Error("Main Session is unavailable");
    mainAgentId = main.agentId;
    sessionId = currentSessionId;
    installed = await installApprovedPlan(fixture, {
      initializeTaskState: false,
    });
    const terminate = vi.spyOn(main.runtime, "terminate");
    const visibleText: string[] = [];
    fixture.harness.events.on("llm:text:delta", (event) =>
      visibleText.push(event.delta)
    );

    await fixture.harness["resumeApprovedPlan"](installed.approved);

    expect(executionPrompt).toContain(
      `"requestId":"${installed.approved.request.requestId}"`,
    );
    expect(executionPrompt).toContain(
      `"sessionId":"${installed.approved.sessionId}"`,
    );
    expect(executionPrompt).toContain(
      "use task_update initialize with the requestId and sessionId from this payload exactly as provided",
    );
    expect(turn).toBe(7);
    expect(completionPromptCounts).toEqual([0, 0, 0, 0, 1, 1, 1]);
    expect(activePlanAtTurn).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    expect(deliverResult).toHaveBeenCalledTimes(1);
    expect(terminate).not.toHaveBeenCalled();
    expect(await fixture.harness.api.tasks.getTaskState(sessionId)).toMatchObject({
      status: "completed",
      todoList: [{
        todoId: "delivered",
        status: "completed",
        result: "The requested result is available and verified.",
      }],
    });
    expect(visibleText).toEqual([finalReport]);
    const finalMessage = fixture.harness.agent.state.messages.findLast((message) =>
      message.role === "assistant"
    ) as AssistantMessage & { dscodeVisibility?: string };
    expect(finalMessage.dscodeVisibility).toBeUndefined();
    expect(rebuildDisplayMessages(
      fixture.harness.agent.state.messages,
      [],
      sessionId,
    ).some((message) => message.content.includes(finalReport))).toBe(true);
    expect(fixture.harness["planContinuation"]).toBeUndefined();
  });

  it("leaves continuation budgeting to the execution episode monitor", async () => {
    const fixture = await createRoutedHarnessFixture({
      streamFn: () => completedStream("unused"),
    });
    fixtures.push(fixture);
    const { harness } = fixture;
    const main = harness.agentSupervisor.list().find((process) =>
      process.role === "main"
    );
    const sessionId = harness.api.sessions.currentId();
    if (!main || !sessionId) throw new Error("Main Session is unavailable");

    const initialized = await harness.api.tasks.mutateTaskState({
      operation: "initialize",
      callerAgentId: main.agentId,
      expectedVersion: 0,
      taskId: "task-budget",
      requestId: "request-budget",
      sessionId,
      todoList: [{ todoId: "playable", title: "Playable game" }],
    });
    if (!initialized.ok) throw new Error("TaskState initialization failed");
    const active = await harness.api.tasks.mutateTaskState({
      operation: "transition",
      callerAgentId: main.agentId,
      expectedVersion: initialized.taskState.version,
      todoId: "playable",
      status: "in_progress",
    });
    if (!active.ok) throw new Error("TaskState transition failed");

    const plan: PlanRecord = {
      ...makePlanInput("plan-budget"),
      sessionId,
      mainAgentId: main.agentId,
      schemaVersion: 2,
      projectKey: "project",
      version: 3,
      revision: 2,
      digest: "a".repeat(64),
      status: "executing",
      commandReceipts: [],
      createdAt: 1,
      updatedAt: 2,
    };
    vi.spyOn(harness["planService"], "load").mockResolvedValue({
      ok: true,
      plan,
    });
    const followUp = vi.spyOn(harness.agent, "followUp");
    const warnings: string[] = [];
    const taskUpdates: number[] = [];
    harness.events.on("ui:warning", (event) => warnings.push(event.text));
    harness.events.on("task:updated", (event) =>
      taskUpdates.push(event.taskState.version)
    );
    harness["planContinuation"] = {
      planId: plan.planId,
      phase: "execution",
      progress: harness["planProgress"](plan),
      stalledFollowUps: 2,
      totalFollowUps: 0,
    };

    await harness["continueIncompletePlan"](plan.planId, false);

    expect(await harness.api.tasks.getTaskState(sessionId))
      .toEqual(active.taskState);
    expect(taskUpdates).toEqual([]);
    expect(followUp).toHaveBeenCalledOnce();
    expect(warnings).toEqual([]);
    expect(harness["planContinuation"]).toBeDefined();
  });
});
