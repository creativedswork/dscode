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
        for (const type of ["tool_execution_start", "tool_execution_end", "turn_end"]) {
          for (const listener of listeners) await listener({ type });
        }
      },
      abort: vi.fn(),
      waitForIdle: vi.fn(),
    };
    const runtime = new PiAgentRuntimeAdapter(agent as any);
    const states: string[] = [];
    const checkpoints: unknown[] = [];

    const output = await runtime.start({
      prompt: "inspect",
      onStateChange: (state) => {
        states.push(state);
      },
      onCheckpoint: (snapshot) => {
        checkpoints.push(snapshot);
      },
    }, new AbortController().signal);

    expect(output.text).toBe("done");
    expect(states).toEqual(["waiting", "running"]);
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
