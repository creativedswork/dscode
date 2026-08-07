import { describe, expect, it, vi } from "vitest";

import { Harness } from "../../src/core/harness.js";
import type {
  AgentExitResult,
  AgentProcess,
} from "../../src/agents/process/types.js";

function result(
  agentId: string,
  output: string,
): AgentExitResult {
  return {
    agentId,
    state: "completed",
    output,
    startedAt: 100,
    endedAt: 200,
  };
}

function setup(options: {
  currentSessionId?: string;
  processSessionId?: string;
  attachment?: "foreground" | "background";
  notifications?: AgentExitResult[];
} = {}) {
  let currentSessionId = options.currentSessionId ?? "session-1";
  const processSessionId = options.processSessionId ?? "session-1";
  const notifications = [...(options.notifications ?? [
    result("agent-research", "Verified claims"),
  ])];
  const process = {
    agentId: "agent-research",
    parentSessionId: processSessionId,
    description: "Researcher: verify paper claims",
    application: { name: "general" } as AgentProcess["application"],
    role: "subagent",
    recording: "session",
    attachment: options.attachment ?? "background",
    exit: notifications[0],
  } as AgentProcess;
  const prompts: string[] = [];
  const emitted: unknown[] = [];
  const harness = Object.create(Harness.prototype) as any;
  Object.assign(harness, {
    pendingBackgroundContinuationSessions: new Set<string>(),
    backgroundContinuationDrain: null,
    shuttingDown: false,
    sessionSwitchInProgress: false,
    activeMainTurn: null,
    agentSupervisor: {
      get: vi.fn((agentId: string) =>
        agentId === process.agentId ? process : undefined
      ),
      consumeNotifications: vi.fn((sessionId: string) => {
        if (sessionId !== processSessionId) return [];
        return notifications.splice(0);
      }),
    },
    sessionManager: {
      getCurrentSessionId: () => currentSessionId,
    },
    events: {
      emit: vi.fn((event: unknown) => emitted.push(event)),
    },
    logger: { error: vi.fn() },
    promptAndSaveInternal: vi.fn(async (prompt: string) => {
      prompts.push(prompt);
    }),
  });

  return {
    harness,
    process,
    prompts,
    emitted,
    setCurrentSessionId(value: string) {
      currentSessionId = value;
    },
    async waitForDrain() {
      const drain = harness.backgroundContinuationDrain as Promise<void> | null;
      if (drain) await drain;
    },
  };
}

describe("Harness background Agent continuation", () => {
  it("resumes the idle Main Agent with the completed result", async () => {
    const fixture = setup();

    fixture.harness.scheduleBackgroundAgentContinuation(
      fixture.process.agentId,
    );
    await fixture.waitForDrain();

    expect(fixture.prompts).toHaveLength(1);
    expect(fixture.prompts[0]).toContain("## Researcher");
    expect(fixture.prompts[0]).toContain("Verified claims");
    expect(fixture.prompts[0]).toContain(
      "continue to the next planned step immediately",
    );
    expect(fixture.emitted).toContainEqual({ type: "processing:start" });
  });

  it("waits for the active Main turn before continuing", async () => {
    const fixture = setup();
    let finishTurn!: () => void;
    const active = new Promise<void>((resolve) => {
      finishTurn = resolve;
    });
    let tracked: Promise<void>;
    tracked = active.finally(() => {
      if (fixture.harness.activeMainTurn === tracked) {
        fixture.harness.activeMainTurn = null;
      }
    });
    fixture.harness.activeMainTurn = tracked;

    fixture.harness.scheduleBackgroundAgentContinuation(
      fixture.process.agentId,
    );
    await Promise.resolve();
    expect(fixture.prompts).toHaveLength(0);

    finishTurn();
    await fixture.waitForDrain();
    expect(fixture.prompts).toHaveLength(1);
  });

  it("batches parallel completion notifications into one Main turn", async () => {
    const fixture = setup({
      notifications: [
        result("agent-research", "Research complete"),
        result("agent-source", "Source extraction complete"),
      ],
    });

    fixture.harness.scheduleBackgroundAgentContinuation(
      fixture.process.agentId,
    );
    await fixture.waitForDrain();

    expect(fixture.prompts).toHaveLength(1);
    expect(fixture.prompts[0]).toContain("Research complete");
    expect(fixture.prompts[0]).toContain("Source extraction complete");
  });

  it("does not continue twice when an active turn already consumed the notification", async () => {
    const fixture = setup();
    fixture.harness.agentSupervisor.consumeNotifications("session-1");

    fixture.harness.scheduleBackgroundAgentContinuation(
      fixture.process.agentId,
    );
    await fixture.waitForDrain();

    expect(fixture.prompts).toHaveLength(0);
  });

  it("defers an inactive Session until it becomes current", async () => {
    const fixture = setup({
      currentSessionId: "session-2",
      processSessionId: "session-1",
    });

    fixture.harness.scheduleBackgroundAgentContinuation(
      fixture.process.agentId,
    );
    await fixture.waitForDrain();
    expect(fixture.prompts).toHaveLength(0);

    fixture.setCurrentSessionId("session-1");
    fixture.harness.startBackgroundContinuationDrain();
    await fixture.waitForDrain();
    expect(fixture.prompts).toHaveLength(1);
  });

  it("does not auto-continue for a foreground Agent", async () => {
    const fixture = setup({ attachment: "foreground" });

    fixture.harness.scheduleBackgroundAgentContinuation(
      fixture.process.agentId,
    );
    await fixture.waitForDrain();

    expect(fixture.prompts).toHaveLength(0);
  });
});
