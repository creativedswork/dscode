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

function assessmentCall(
  id: string,
  route: "direct" | "plan" = "plan",
  callId = "route-call",
) {
  return {
    type: "toolCall" as const,
    id: callId,
    name: PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
    arguments: {
      requestId: id,
      intentUncertainty: 0,
      solutionDivergence: 0,
      impact: route === "plan" ? 2 : 0,
      risk: 0,
      coordination: 0,
      evidence: [`${route} test evidence`],
    },
  };
}

async function fixture(options: Parameters<
  typeof createRoutedHarnessFixture
>[0]): Promise<RoutedHarnessFixture> {
  const created = await createRoutedHarnessFixture(options);
  fixtures.push(created);
  return created;
}

describe("Harness/Pi Plan continuation boundary", () => {
  it("keeps a dynamically discovered MCP mutation behind the Main route wrapper", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "mutation ran" }],
      details: {},
    }));
    const streamFn: StreamFn = vi.fn((_model, context) =>
      response(assistant([
        {
          type: "toolCall",
          id: "search-call",
          name: "search_tools",
          arguments: { query: "select:mcp__demo__mutate" },
        },
        assessmentCall(requestId(context)),
        {
          type: "toolCall",
          id: "mutation-call",
          name: "mcp__demo__mutate",
          arguments: {},
        },
      ], "toolUse"))
    );
    const { harness } = await fixture({
      streamFn,
      configureDeferredDrivers: (drivers) => drivers.register({
        name: "mcp__demo",
        description: "deferred routing test tools",
        source: "mcp",
        tools: [{
          name: "mcp__demo__mutate",
          label: "Deferred mutation",
          description: "Mutate external state",
          effect: "external_write",
          parameters: Type.Object({}),
          execute,
        }],
      }),
    });

    const result = await harness.api.conversation.prompt("route this");

    expect(result.kind).toBe("planner_requested");
    expect(streamFn).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    [
      "assessment then unknown tool",
      (id: string) => [
        assessmentCall(id),
        {
          type: "toolCall" as const,
          id: "unknown-call",
          name: "unknown_tool",
          arguments: {},
        },
      ],
    ],
    [
      "unknown tool then assessment",
      (id: string) => [
        {
          type: "toolCall" as const,
          id: "unknown-call",
          name: "unknown_tool",
          arguments: {},
        },
        assessmentCall(id),
      ],
    ],
    [
      "assessment then invalid arguments",
      (id: string) => [
        assessmentCall(id),
        {
          type: "toolCall" as const,
          id: "invalid-call",
          name: "read_file",
          arguments: {},
        },
      ],
    ],
    [
      "invalid arguments then assessment",
      (id: string) => [
        {
          type: "toolCall" as const,
          id: "invalid-call",
          name: "read_file",
          arguments: {},
        },
        assessmentCall(id),
      ],
    ],
    [
      "duplicate assessments",
      (id: string) => [
        assessmentCall(id, "plan", "route-call-1"),
        assessmentCall(id, "plan", "route-call-2"),
      ],
    ],
  ])("stops Plan handoff after one model stream for %s", async (_name, calls) => {
    const streamFn: StreamFn = vi.fn((_model, context) =>
      response(assistant(calls(requestId(context)), "toolUse"))
    );
    const { harness } = await fixture({ streamFn });

    const result = await harness.api.conversation.prompt("route this");

    expect(result.kind).toBe("planner_requested");
    expect(streamFn).toHaveBeenCalledTimes(1);
    expect(harness.agent.state.systemPrompt).not.toContain(
      "Active Request Routing",
    );
  });

  it("continues a Direct route and executes a later mutation", async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "mutation ran" }],
      details: {},
    }));
    let calls = 0;
    const streamFn: StreamFn = vi.fn((_model, context) => {
      calls++;
      if (calls === 1) {
        return response(assistant([
          assessmentCall(requestId(context), "direct"),
        ], "toolUse"));
      }
      if (calls === 2) {
        return response(assistant([{
          type: "toolCall",
          id: "mutation-call",
          name: "test_mutation",
          arguments: {},
        }], "toolUse"));
      }
      return response(assistant([{ type: "text", text: "done" }], "stop"));
    });
    const { harness } = await fixture({
      streamFn,
      configureDrivers: (drivers) => drivers.register({
        name: "routing-test",
        description: "routing test tools",
        source: "builtin",
        tools: [{
          name: "test_mutation",
          label: "Test mutation",
          description: "Mutate test state",
          effect: "workspace_write",
          parameters: Type.Object({}),
          execute,
        }],
      }),
    });

    const result = await harness.api.conversation.prompt("route this");

    expect(result).toMatchObject({
      kind: "main",
      decision: { route: "direct" },
    });
    expect(streamFn).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(harness.agent.state.systemPrompt).not.toContain(
      "Active Request Routing",
    );
  });
});
