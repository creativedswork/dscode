import {
  createAssistantMessageEventStream,
  Type,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
} from "../../../src/application/plan/index.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";

const fixtures: RoutedHarnessFixture[] = [];

interface ObservedContext {
  systemPrompt?: string;
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

function assistant(
  content: AssistantMessage["content"],
  stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
  return {
    role: "assistant",
    content,
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

function response(message: AssistantMessage) {
  const stream = createAssistantMessageEventStream();
  stream.push({
    type: "done",
    reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
    message,
  });
  return stream;
}

function requestId(context: Context): string {
  const match = context.systemPrompt?.match(/Request ID: ([^\n]+)/);
  if (!match) throw new Error("Route request ID missing from stream context");
  return match[1];
}

function routeAssessment(id: string, route: "direct" | "plan") {
  return {
    requestId: id,
    intentUncertainty: 0,
    solutionDivergence: 0,
    impact: route === "plan" ? 2 : 0,
    risk: 0,
    coordination: 0,
    evidence: [`${route} test evidence`],
  };
}

function mainRequestId(
  result: Awaited<ReturnType<RoutedHarnessFixture["harness"]["promptAndSave"]>>,
): string {
  if (result.kind !== "main") {
    throw new Error("Expected Main routing result");
  }
  return result.requestId;
}

async function fixture(options: Parameters<
  typeof createRoutedHarnessFixture
>[0]): Promise<RoutedHarnessFixture> {
  const created = await createRoutedHarnessFixture(options);
  fixtures.push(created);
  return created;
}

describe("Harness/Pi Plan routing", () => {
  it("snapshots the current request identity and clears it across requests and sessions", async () => {
    const contexts: ObservedContext[] = [];
    const streamFn: StreamFn = vi.fn((_model, context) => {
      contexts.push({ systemPrompt: context.systemPrompt });
      return response(assistant([{ type: "text", text: "done" }], "stop"));
    });
    const { harness } = await fixture({ streamFn });

    const first = await harness.api.conversation.prompt("first request");
    const second = await harness.api.conversation.prompt("second request");
    const previousSession = harness.api.sessions.currentId();
    harness.api.conversation.reset();
    const nextSession = harness.api.sessions.currentId();
    const third = await harness.api.conversation.prompt("third request");
    const firstId = mainRequestId(first);
    const secondId = mainRequestId(second);
    const thirdId = mainRequestId(third);

    expect(contexts).toHaveLength(3);
    expect(contexts[0].systemPrompt).toContain(`Request ID: ${firstId}`);
    expect(contexts[1].systemPrompt).toContain(`Request ID: ${secondId}`);
    expect(contexts[1].systemPrompt).not.toContain(firstId);
    expect(contexts[2].systemPrompt).toContain(`Request ID: ${thirdId}`);
    expect(contexts[2].systemPrompt).not.toContain(firstId);
    expect(contexts[2].systemPrompt).not.toContain(secondId);
    expect(previousSession).not.toBe(nextSession);
    expect(harness.agent.state.systemPrompt).not.toContain("Active Request Routing");
  });

  it("clears the active request identity on abort before the next request", async () => {
    const contexts: Context[] = [];
    let releaseFirst = () => {};
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const streamFn: StreamFn = vi.fn((_model, context) => {
      contexts.push(context);
      if (contexts.length > 1) {
        return response(assistant([{ type: "text", text: "done" }], "stop"));
      }
      const stream = createAssistantMessageEventStream();
      releaseFirst = () => stream.push({
        type: "error",
        reason: "aborted",
        error: assistant([{ type: "text", text: "" }], "aborted"),
      });
      markStarted();
      return stream;
    });
    const { harness } = await fixture({ streamFn });

    const pending = harness.api.conversation.prompt("cancel this request");
    await started;
    const cancelledId = requestId(contexts[0]);
    harness.api.conversation.abort();
    expect(harness.agent.state.systemPrompt).not.toContain(cancelledId);
    releaseFirst();
    await pending;

    const next = await harness.api.conversation.prompt("next request");
    const nextId = mainRequestId(next);
    expect(contexts[1].systemPrompt).toContain(`Request ID: ${nextId}`);
    expect(contexts[1].systemPrompt).not.toContain(cancelledId);
    expect(harness.agent.state.systemPrompt).not.toContain(
      "Active Request Routing",
    );
  });

  it.each([
    ["write_file", "workspace_write", 0],
    ["read_file", "read", 1],
  ] as const)(
    "terminates a Plan assessment batch containing %s",
    async (toolName, effect, expectedExecutions) => {
      const execute = vi.fn(async () => ({
        content: [{ type: "text" as const, text: "tool ran" }],
        details: {},
      }));
      let calls = 0;
      const streamFn: StreamFn = vi.fn((_model, context) => {
        calls++;
        if (calls > 1) {
          return response(assistant(
            [{ type: "text", text: "unexpected continuation" }],
            "stop",
          ));
        }
        const id = requestId(context);
        return response(assistant([
          {
            type: "toolCall",
            id: "route-call",
            name: PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
            arguments: routeAssessment(id, "plan"),
          },
          {
            type: "toolCall",
            id: "sibling-call",
            name: toolName,
            arguments: {},
          },
        ], "toolUse"));
      });
      const { harness } = await fixture({
        streamFn,
        configureDrivers: (drivers) => drivers.register({
          name: "fs",
          description: "routing test tools",
          source: "builtin",
          tools: [{
            name: toolName,
            label: toolName,
            description: toolName,
            effect,
            parameters: Type.Object({}),
            execute,
          }],
        }),
      });

      const result = await harness.api.conversation.prompt("route this");

      expect(result.kind).toBe("planner_requested");
      expect(streamFn).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(expectedExecutions);
    },
  );

  it("turns an explicit Plan request into a supervised foreground Planner", async () => {
    const streamFn: StreamFn = vi.fn(() =>
      response(assistant([{ type: "text", text: "unexpected Main call" }], "stop"))
    );
    const { harness } = await fixture({ streamFn });

    const result = await harness.api.conversation.prompt(
      "prepare a migration plan",
      undefined,
      "plan",
    );

    expect(result.kind).toBe("planner_requested");
    expect(streamFn).not.toHaveBeenCalled();
    const processes = harness.agentSupervisor.list();
    const main = processes.find((process) => process.role === "main");
    const planner = processes.find((process) =>
      process.application.name === "planner"
    );
    expect(main?.state).toBe("waiting");
    expect(planner).toMatchObject({
      parentAgentId: main?.agentId,
      parentSessionId: main?.parentSessionId,
      attachment: "foreground",
      application: {
        permissionMode: "plan",
        source: { kind: "internal", path: "programmatic:planner" },
      },
    });
    expect(harness.agentSupervisor.foreground(main!.parentSessionId)?.agentId)
      .toBe(planner?.agentId);
  });
});
