import { describe, expect, it, vi } from "vitest";

import { ConversationCoordinator } from "../../src/application/conversation-coordinator.js";
import { SessionCoordinator } from "../../src/application/session-coordinator.js";
import type {
  AgentExitResult,
  AgentProcess,
} from "../../src/agents/process/types.js";

function result(agentId: string, output: string): AgentExitResult {
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
    application: { name: "general" },
    role: "subagent",
    recording: "session",
    attachment: options.attachment ?? "background",
    exit: notifications[0],
  } as AgentProcess;
  const prompts: string[] = [];
  const emitted: unknown[] = [];
  const conversation = new ConversationCoordinator();
  const supervisor = {
    consumeNotifications: vi.fn((sessionId: string) =>
      sessionId === processSessionId ? notifications.splice(0) : []
    ),
  };
  const coordinator = new SessionCoordinator({
    sessionManager: {
      getCurrentSessionId: () => currentSessionId,
    } as any,
    agentSupervisor: () => supervisor as any,
    mainAgentId: () => "main",
    agent: () => ({ state: { messages: [] } }) as any,
    projectPath: () => "/project",
    abort: () => {},
    conversation,
    logger: { info: vi.fn(), error: vi.fn() } as any,
    resumeNotifications: async (completed) => {
      prompts.push(completed.map((item) => item.output).join("\n"));
    },
    publish: (event) => emitted.push(event),
  });

  return {
    coordinator,
    conversation,
    process,
    prompts,
    emitted,
    supervisor,
    setCurrentSessionId(value: string) {
      currentSessionId = value;
    },
    async waitForDrain() {
      const drain = (coordinator as any).backgroundDrain as Promise<void> | null;
      if (drain) await drain;
    },
  };
}

describe("SessionCoordinator background Agent continuation", () => {
  it("resumes the idle Main Agent with the completed result", async () => {
    const fixture = setup();
    fixture.coordinator.scheduleBackgroundProcess(fixture.process);
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual(["Verified claims"]);
    expect(fixture.emitted).toContainEqual({ type: "processing:start" });
  });

  it("waits for the active Main turn before continuing", async () => {
    const fixture = setup();
    let finish!: () => void;
    const active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const turn = fixture.conversation.run(() => active);
    fixture.coordinator.scheduleBackgroundProcess(fixture.process);
    await Promise.resolve();
    expect(fixture.prompts).toEqual([]);
    finish();
    await turn;
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual(["Verified claims"]);
  });

  it("batches parallel completion notifications into one Main turn", async () => {
    const fixture = setup({
      notifications: [
        result("agent-research", "Research complete"),
        result("agent-source", "Source extraction complete"),
      ],
    });
    fixture.coordinator.scheduleBackgroundProcess(fixture.process);
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual([
      "Research complete\nSource extraction complete",
    ]);
  });

  it("does not continue after another turn consumed the notification", async () => {
    const fixture = setup();
    fixture.supervisor.consumeNotifications("session-1");
    fixture.coordinator.scheduleBackgroundProcess(fixture.process);
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual([]);
  });

  it("defers an inactive Session until it becomes current", async () => {
    const fixture = setup({
      currentSessionId: "session-2",
      processSessionId: "session-1",
    });
    fixture.coordinator.scheduleBackgroundProcess(fixture.process);
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual([]);
    fixture.setCurrentSessionId("session-1");
    (fixture.coordinator as any).startBackgroundDrain();
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual(["Verified claims"]);
  });

  it("does not auto-continue for a foreground Agent", async () => {
    const fixture = setup({ attachment: "foreground" });
    fixture.coordinator.scheduleBackgroundProcess(fixture.process);
    await fixture.waitForDrain();
    expect(fixture.prompts).toEqual([]);
  });
});
