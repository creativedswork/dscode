import { describe, expect, it, vi } from "vitest";

import type { AgentApplicationSnapshot } from "../../../src/agents/definitions/types.js";
import { createMainAgentContext } from "../../../src/agents/process/context.js";
import {
  AgentFallbackRegistry,
  type AgentFallbackHandler,
} from "../../../src/agents/process/fallback.js";
import { AgentSupervisor } from "../../../src/agents/process/supervisor.js";
import {
  AgentRuntimeFailure,
  type AgentProcessRuntime,
} from "../../../src/agents/runtimes/runtime.js";
import { HarnessEventBus } from "../../../src/application/events.js";

function application(name: string): AgentApplicationSnapshot {
  return {
    name,
    description: name,
    systemPrompt: name,
    fallback: name === "vision"
      ? [{ handler: "ocr", on: ["model_error", "empty_output"] }]
      : undefined,
    source: { kind: "bundled", path: `${name}.md` },
    digest: name.padEnd(64, "0"),
    registryGeneration: 1,
  };
}

describe("Agent fallback execution", () => {
  it("recovers a failed Pi runtime under the same Agent process", async () => {
    const apps = new Map([
      ["main", application("main")],
      ["vision", application("vision")],
    ]);
    const failedRuntime: AgentProcessRuntime = {
      capabilities: { suspend: false, messaging: false },
      async start() {
        throw new AgentRuntimeFailure("model_error", "provider failed");
      },
      async terminate() {},
      kill() {},
    };
    const fallback: AgentFallbackHandler = {
      name: "ocr",
      async execute(context) {
        return {
          text: `${context.input.prompt}\nOCR`,
          details: { executionSource: "ocr" },
        };
      },
    };
    const registry = new AgentFallbackRegistry();
    registry.register(fallback);
    const supervisor = new AgentSupervisor(
      { require: (name: string) => apps.get(name)! } as any,
      () => failedRuntime,
      { save: vi.fn(async () => {}) } as any,
      new HarnessEventBus({ error: vi.fn() } as any),
      { error: vi.fn() } as any,
      () => [],
      1,
      registry,
    );
    const main = supervisor.registerMain(
      application("main"),
      failedRuntime,
      createMainAgentContext("/project", "session", []),
    );

    const spawned = await supervisor.spawn({
      application: "vision",
      parentAgentId: main.agentId,
      input: { prompt: "inspect image" },
    });

    expect(spawned.result).toMatchObject({
      agentId: spawned.agentId,
      state: "completed",
      output: "inspect image\nOCR",
      details: { executionSource: "ocr" },
    });
    expect(supervisor.require(spawned.agentId).agentId).toBe(spawned.agentId);
  });
});
