import { describe, expect, it, vi } from "vitest";

import type { AgentSupervisor } from "../../src/agents/process/supervisor.js";
import type { SpawnAgentRequest } from "../../src/agents/process/types.js";
import {
  runStructuredAgent,
} from "../../src/eval/chief/runner.js";

function host(outputs: Array<{ state?: string; output?: string; error?: string }>) {
  let index = 0;
  const spawn = vi.fn(async (request: SpawnAgentRequest) => {
    const agentId = `worker-${index + 1}`;
    request.onSpawn?.(agentId);
    const current = outputs[index++] ?? {};
    return {
      agentId,
      result: {
        agentId,
        state: current.state ?? "completed",
        output: current.output,
        error: current.error,
        startedAt: 1,
        endedAt: 2,
      },
    };
  });
  return {
    value: {
      agentSupervisor: {
        list: () => [{ role: "main", agentId: "main-1" }],
        spawn,
      } as unknown as AgentSupervisor,
    },
    spawn,
  };
}

describe("runStructuredAgent", () => {
  it("runs a process-only foreground Application in the eval workspace", async () => {
    const fake = host([{ output: "```json\n{\"answer\":42}\n```" }]);

    const result = await runStructuredAgent({
      host: fake.value,
      application: "chief-graph",
      prompt: "Build graph",
      workspace: "/tmp/eval/run/library",
      stage: "graph",
      validate: (value) =>
        (value as { answer?: number }).answer === 42
          ? { ok: true, value: value as { answer: number } }
          : { ok: false, errors: ["answer must be 42"] },
    });

    expect(result.value).toEqual({ answer: 42 });
    expect(result.workerAgentIds).toEqual(["worker-1"]);
    expect(fake.spawn).toHaveBeenCalledWith(expect.objectContaining({
      application: "chief-graph",
      parentAgentId: "main-1",
      input: { prompt: "Build graph" },
      cwd: "/tmp/eval/run/library",
      attachment: "foreground",
      recording: "process-only",
    }));
  });

  it("retries once with precise validation feedback", async () => {
    const fake = host([
      { output: "{\"answer\":1}" },
      { output: "{\"answer\":42}" },
    ]);

    const result = await runStructuredAgent({
      host: fake.value,
      application: "chief-oracle",
      prompt: "Build Oracle",
      workspace: "/tmp/eval/run/library",
      stage: "oracle",
      validate: (value) =>
        (value as { answer?: number }).answer === 42
          ? { ok: true, value }
          : { ok: false, errors: ["answer must be 42"] },
    });

    expect(result.attempts).toBe(2);
    expect(result.workerAgentIds).toEqual(["worker-1", "worker-2"]);
    expect(fake.spawn.mock.calls[1][0].input.prompt).toContain("answer must be 42");
    expect(fake.spawn.mock.calls[1][0].input.prompt).toContain("{\"answer\":1}");
  });

  it("fails the stage after one retry", async () => {
    const fake = host([
      { output: "not json" },
      { state: "failed", error: "model failed" },
    ]);

    await expect(runStructuredAgent({
      host: fake.value,
      application: "chief-backtrack",
      prompt: "Backtrack",
      workspace: "/tmp/eval/run/library",
      stage: "backtrack",
      validate: () => ({ ok: false, errors: ["invalid"] }),
    })).rejects.toMatchObject({
      name: "StructuredAgentError",
      application: "chief-backtrack",
      workerAgentIds: ["worker-1", "worker-2"],
    });
  });

  it("propagates abort before spawning a worker", async () => {
    const fake = host([{ output: "{}" }]);
    const controller = new AbortController();
    controller.abort();

    await expect(runStructuredAgent({
      host: fake.value,
      application: "chief-attribution",
      prompt: "Attribute",
      workspace: "/tmp/eval/run/library",
      stage: "attribution",
      signal: controller.signal,
      validate: (value) => ({ ok: true, value }),
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.spawn).not.toHaveBeenCalled();
  });
});
