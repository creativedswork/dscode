import { describe, expect, it, vi } from "vitest";

import { PiAgentRuntimeAdapter } from "../../../src/agents/runtimes/pi-agent-runtime.js";

describe("PiAgentRuntimeAdapter snapshot", () => {
  it("removes raw image base64 from Process Store snapshots", () => {
    const agent = {
      state: {
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "inspect" },
            { type: "image", data: "RAW_BASE64_SECRET", mimeType: "image/png" },
          ],
        }],
      },
    };
    const runtime = new PiAgentRuntimeAdapter(agent as any);

    const serialized = JSON.stringify(runtime.snapshot());
    expect(serialized).not.toContain("RAW_BASE64_SECRET");
    expect(serialized).toContain("image_omitted");
  });

  it("reports tool waiting state and checkpoints each completed turn", async () => {
    const listeners = new Set<(event: { type: string }) => Promise<void> | void>();
    const agent = {
      state: {
        messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }],
      },
      subscribe(listener: (event: { type: string }) => Promise<void> | void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async prompt() {
        const events = [
          { type: "tool_execution_start", toolCallId: "call-1", toolName: "read_file" },
          {
            type: "tool_execution_end",
            toolCallId: "call-1",
            toolName: "read_file",
            result: { content: [{ type: "text", text: "file contents" }] },
            isError: false,
          },
          { type: "turn_end" },
        ];
        for (const event of events) {
          for (const listener of listeners) await listener(event);
        }
      },
      abort: vi.fn(),
      waitForIdle: vi.fn(),
    };
    const runtime = new PiAgentRuntimeAdapter(agent as any);
    const states: string[] = [];
    const progress: string[] = [];
    const progressDetails: unknown[] = [];
    const checkpoints: unknown[] = [];

    const output = await runtime.start({
      prompt: "inspect",
      onStateChange: (state) => {
        states.push(state);
      },
      onProgress: (item) => {
        progress.push(item.message ?? "");
        progressDetails.push(item.details);
      },
      onCheckpoint: (snapshot) => {
        checkpoints.push(snapshot);
      },
    }, new AbortController().signal);

    expect(output.text).toBe("done");
    expect(states).toEqual(["waiting", "running"]);
    expect(progress).toEqual([
      "Running read_file",
      "Finished read_file; preparing result",
    ]);
    expect(progressDetails).toEqual([
      expect.objectContaining({
        kind: "tool",
        status: "running",
        toolCallId: "call-1",
        toolName: "read_file",
      }),
      expect.objectContaining({
        kind: "tool",
        status: "completed",
        toolCallId: "call-1",
        toolName: "read_file",
        isError: false,
        result: {
          content: [{
            type: "text",
            text: "file contents",
          }],
        },
      }),
    ]);
    expect(progressDetails[1]).not.toHaveProperty("resultDetail");
    expect(checkpoints).toHaveLength(1);
    expect(listeners.size).toBe(0);
  });

  it("serializes parallel tool events when the runtime does not await subscribers", async () => {
    const listeners = new Set<(event: any) => Promise<void> | void>();
    const agent = {
      state: {
        messages: [{ role: "assistant", content: [{ type: "text", text: "done" }] }],
      },
      subscribe(listener: (event: any) => Promise<void> | void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async prompt() {
        const events = [
          { type: "tool_execution_start", toolCallId: "call-1", toolName: "read_file" },
          { type: "tool_execution_start", toolCallId: "call-2", toolName: "read_file" },
          { type: "tool_execution_end", toolCallId: "call-1", toolName: "read_file", isError: false },
          { type: "tool_execution_end", toolCallId: "call-2", toolName: "read_file", isError: true },
          { type: "turn_end" },
        ];
        for (const event of events) {
          for (const listener of listeners) void listener(event);
        }
      },
      abort: vi.fn(),
      waitForIdle: vi.fn(),
    };
    const runtime = new PiAgentRuntimeAdapter(agent as any);
    const states: string[] = [];
    const progress: string[] = [];
    const checkpoints: unknown[] = [];

    await runtime.start({
      prompt: "inspect",
      onStateChange: async (state) => {
        await Promise.resolve();
        states.push(state);
      },
      onProgress: async (item) => {
        await Promise.resolve();
        progress.push(item.message ?? "");
      },
      onCheckpoint: async (snapshot) => {
        await Promise.resolve();
        checkpoints.push(snapshot);
      },
    }, new AbortController().signal);

    expect(states).toEqual(["waiting", "running"]);
    expect(progress).toEqual([
      "Running read_file",
      "Running read_file",
      "Running read_file",
      "Finished read_file; preparing result",
    ]);
    expect(checkpoints).toHaveLength(1);
    expect(listeners.size).toBe(0);
  });

  it("passes generic image attachments to PiAgentRuntime", async () => {
    const prompt = vi.fn(async () => {});
    const agent = {
      state: {
        messages: [{ role: "assistant", content: [{ type: "text", text: "evidence" }] }],
      },
      subscribe: () => () => {},
      prompt,
      abort: vi.fn(),
      waitForIdle: vi.fn(),
    };
    const runtime = new PiAgentRuntimeAdapter(agent as any);
    await runtime.start({
      prompt: "inspect",
      attachments: [{
        type: "image",
        data: { type: "image", data: "base64", mimeType: "image/png" },
      }],
    }, new AbortController().signal);

    expect(prompt).toHaveBeenCalledWith("inspect", [{
      type: "image",
      data: "base64",
      mimeType: "image/png",
    }]);
  });

  it("classifies model errors for Application fallback", async () => {
    const agent = {
      state: {
        messages: [{
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: "provider failed",
        }],
      },
      subscribe: () => () => {},
      prompt: vi.fn(async () => {}),
      abort: vi.fn(),
      waitForIdle: vi.fn(),
    };
    const runtime = new PiAgentRuntimeAdapter(agent as any);

    await expect(runtime.start(
      { prompt: "inspect" },
      new AbortController().signal,
    )).rejects.toMatchObject({
      name: "AgentRuntimeFailure",
      code: "model_error",
      message: "provider failed",
    });
  });
});
