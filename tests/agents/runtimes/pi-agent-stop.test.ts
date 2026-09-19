import { Agent } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  Type,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";

function toolCallMessage(): AssistantMessage {
  return {
    role: "assistant",
    content: [{
      type: "toolCall",
      id: "call-1",
      name: "record_result",
      arguments: { value: "observed" },
    }],
    api: "openai-completions",
    provider: "deepseek",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "toolUse",
    timestamp: 1,
  };
}

describe("Pi Agent turn stop integration", () => {
  it("stops after the current tool batch and before another provider request", async () => {
    const message = toolCallMessage();
    const streamFn = vi.fn(() => {
      const stream = createAssistantMessageEventStream();
      stream.push({ type: "done", reason: "toolUse", message });
      return stream;
    });
    const execute = vi.fn(async () => ({
      content: [{ type: "text" as const, text: "tool completed" }],
      details: {},
    }));
    const observedEvents: string[] = [];
    const agent = new Agent({
      initialState: {
        systemPrompt: "test",
        model: {
          id: "test-model",
          name: "Test",
          api: "openai-completions",
          provider: "deepseek",
          baseUrl: "https://example.invalid",
          reasoning: false,
          input: ["text"],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 1_000,
          maxTokens: 100,
        },
        tools: [{
          name: "record_result",
          label: "Record result",
          description: "Records a result",
          parameters: Type.Object({ value: Type.String() }),
          execute,
        }],
      },
      streamFn,
      shouldStopAfterTurn: ({ toolResults, context }) => {
        expect(toolResults).toHaveLength(1);
        expect(toolResults[0]?.content).toEqual([
          { type: "text", text: "tool completed" },
        ]);
        expect(context.messages.at(-1)?.role).toBe("toolResult");
        return true;
      },
    });
    agent.subscribe((event) => {
      observedEvents.push(event.type);
    });

    await agent.prompt("run the tool");

    expect(execute).toHaveBeenCalledOnce();
    expect(streamFn).toHaveBeenCalledOnce();
    expect(observedEvents.slice(-2)).toEqual(["turn_end", "agent_end"]);
    expect(agent.state.messages.at(-1)?.role).toBe("toolResult");
  });
});
