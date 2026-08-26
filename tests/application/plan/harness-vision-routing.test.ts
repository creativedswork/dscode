import type { StreamFn } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

const childModel = vi.hoisted(() => ({
  stream: undefined as StreamFn | undefined,
}));

vi.mock("../../../src/models/index.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../src/models/index.js")
  >();
  return {
    ...actual,
    streamSimple: (...args: Parameters<StreamFn>) => {
      if (!childModel.stream) {
        throw new Error("Unexpected child model stream");
      }
      return childModel.stream(...args);
    },
  };
});

import { MCPManager } from "../../../src/mcp/manager.js";
import {
  PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
} from "../../../src/application/plan/index.js";
import {
  createRoutedHarnessFixture,
  type RoutedHarnessFixture,
} from "../../helpers/routed-harness.js";

const fixtures: RoutedHarnessFixture[] = [];

interface ObservedContext {
  messages: Context["messages"];
}

afterEach(async () => {
  childModel.stream = undefined;
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

async function fixture(options: Parameters<
  typeof createRoutedHarnessFixture
>[0]): Promise<RoutedHarnessFixture> {
  const created = await createRoutedHarnessFixture(options);
  fixtures.push(created);
  return created;
}

describe("Harness/Pi Vision route effects", () => {
  it("defers Auto image processing until a Direct assessment is active", async () => {
    let current: RoutedHarnessFixture | undefined;
    const contexts: ObservedContext[] = [];
    const streamFn: StreamFn = vi.fn((_model, context) => {
      contexts.push({ messages: structuredClone(context.messages) });
      if (contexts.length === 1) {
        expect(current?.imagePipeline.process).not.toHaveBeenCalled();
        expect(current?.imageStore.put).not.toHaveBeenCalled();
        expect(current?.imageStore.putSync).not.toHaveBeenCalled();
        return response(assistant([{
          type: "toolCall",
          id: "route-call",
          name: PLAN_ROUTE_ASSESSMENT_TOOL_NAME,
          arguments: {
            requestId: requestId(context),
            intentUncertainty: 0,
            solutionDivergence: 0,
            impact: 0,
            risk: 0,
            coordination: 0,
            evidence: ["Direct image inspection"],
          },
        }], "toolUse"));
      }
      return response(assistant([{ type: "text", text: "done" }], "stop"));
    });
    current = await fixture({
      streamFn,
      agentsEnabled: false,
      vision: {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        key: "vision-key",
      },
    });

    const result = await current.harness.api.conversation.promptWithImages(
      "inspect",
      [{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" }],
    );

    expect(result).toMatchObject({
      kind: "main",
      decision: { route: "direct" },
    });
    expect(contexts).toHaveLength(2);
    expect(JSON.stringify(contexts[0].messages)).not.toContain("aW1hZ2U=");
    expect(JSON.stringify(contexts[1].messages)).toContain("visible text");
    expect(current.imagePipeline.process).toHaveBeenCalledOnce();
  });

  it("skips image post-processing for a real Plan Agent MCP read result", async () => {
    let childCalls = 0;
    childModel.stream = (_model, _context) => {
      childCalls++;
      return childCalls === 1
        ? response(assistant([{
            type: "toolCall",
            id: "mcp-call",
            name: "mcp__demo__screenshot",
            arguments: {},
          }], "toolUse"))
        : response(assistant([{ type: "text", text: "inspected" }], "stop"));
    };
    const current = await fixture({
      streamFn: () =>
        response(assistant([{ type: "text", text: "unused" }], "stop")),
      definitions: [{
        name: "plan-reader",
        description: "Read-only plan investigator",
        systemPrompt: "PLAN_READER",
        tools: ["mcp__demo__screenshot"],
        model: "inherit",
        permissionMode: "plan",
      }],
    });
    const manager = new MCPManager([], {}, current.imageStore);
    const client = {
      callTool: vi.fn(async () => ({
        content: [{
          type: "image",
          data: "aW1hZ2U=",
          mimeType: "image/png",
        }],
      })),
    };
    manager.processImages = (images, text, options) =>
      (current.harness as any).processMcpImages(images, text, options);
    const tool = (manager as any).buildAgentTool("demo", {
      name: "screenshot",
      description: "Capture an image",
      effect: "read",
      inputSchema: { type: "object", properties: {} },
    }, client);
    current.drivers.register({
      name: "mcp__demo",
      description: "Demo MCP",
      source: "mcp",
      tools: [tool],
    });
    const main = current.harness.agentSupervisor.list()
      .find((process) => process.role === "main")!;
    await current.harness.agentSupervisor.updateMainCapabilities(
      main.agentId,
      [...main.context.allowedTools, tool.name],
    );

    const spawned = await current.harness.agentSupervisor.spawn({
      application: "plan-reader",
      parentAgentId: main.agentId,
      input: { prompt: "inspect the screenshot" },
    });

    expect(spawned.result?.state).toBe("completed");
    expect(client.callTool).toHaveBeenCalledOnce();
    expect(current.imageStore.put).not.toHaveBeenCalled();
    expect(current.imageStore.putSync).not.toHaveBeenCalled();
    expect(current.imagePipeline.process).not.toHaveBeenCalled();
    expect(current.harness.agentSupervisor.list().some(
      (process) => process.application.name === "vision",
    )).toBe(false);
  });
});
