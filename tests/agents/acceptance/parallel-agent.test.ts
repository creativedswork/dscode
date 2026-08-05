import { describe, expect, it, vi } from "vitest";

import type { AgentApplicationSnapshot } from "../../../src/agents/application/types.js";
import { createMainAgentContext } from "../../../src/agents/process/context.js";
import { AgentSupervisor } from "../../../src/agents/process/supervisor.js";
import type {
  AgentProcessInput,
  AgentProcessRuntime,
} from "../../../src/agents/runtimes/runtime.js";
import { HarnessEventBus } from "../../../src/core/events.js";

function application(name: string): AgentApplicationSnapshot {
  return {
    name,
    description: name,
    systemPrompt: name,
    tools: ["read_file"],
    source: { kind: "project-dscode", path: `.dscode/agents/${name}.md` },
    digest: name.padEnd(64, "0"),
    registryGeneration: 1,
  };
}

describe("parallel Agent process acceptance", () => {
  it("runs two configured read-only children concurrently under Main Agent", async () => {
    const main = application("main");
    const worker = application("worker");
    const apps = new Map([["main", main], ["worker", worker]]);
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtimeFactory = (): AgentProcessRuntime => ({
      capabilities: { suspend: false, messaging: false },
      async start(input: AgentProcessInput) {
        active++;
        maximum = Math.max(maximum, active);
        if (active === 2) release();
        await bothStarted;
        active--;
        return { text: `processed: ${input.prompt}` };
      },
      async terminate() {},
      kill() {},
    });
    const supervisor = new AgentSupervisor(
      { require: (name: string) => apps.get(name)! } as any,
      runtimeFactory,
      { save: vi.fn(async () => {}) } as any,
      new HarnessEventBus({ error: vi.fn() } as any),
      { error: vi.fn() } as any,
      () => ["read_file"],
    );
    const root = supervisor.registerMain(
      main,
      runtimeFactory(),
      createMainAgentContext("/project", "session", ["read_file"]),
    );

    const children = await Promise.all(["src", "tests"].map((prompt) =>
      supervisor.spawn({
        application: "worker",
        input: { prompt },
        parentAgentId: root.agentId,
        attachment: "background",
      }),
    ));
    const results = await Promise.all(children.map((child) => supervisor.wait(child.agentId)));

    expect(new Set(children.map((child) => child.agentId)).size).toBe(2);
    expect(maximum).toBe(2);
    expect(results.map((result) => result.output).sort()).toEqual([
      "processed: src",
      "processed: tests",
    ]);
  });
});
