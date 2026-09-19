import { vi } from "vitest";

import type { TaskState } from "../../src/agents/process/task-state.js";
import { HarnessEventBus } from "../../src/application/events.js";
import type {
  ExecutionEpisodeSnapshot,
  PlanRecord,
} from "../../src/application/plan/index.js";
import { WebUiBackend } from "../../src/ui/web/web-backend.js";
import { makePlanInput } from "../application/plan/helpers.js";
import { createHarnessApiFixture } from "../helpers/harness-api.js";

export function makePlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    ...makePlanInput(),
    schemaVersion: 2,
    projectKey: "project",
    version: 3,
    revision: 2,
    digest: "a".repeat(64),
    commandReceipts: [],
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

export function makeTaskState(
  overrides: Partial<TaskState> = {},
): TaskState {
  return {
    taskId: "task-1",
    requestId: "request-1",
    sessionId: "session-1",
    version: 1,
    status: "active",
    todoList: [{
      todoId: "outcome-1",
      title: "Deliver the requested outcome",
      status: "pending",
    }],
    history: [],
    updatedAt: 10,
    ...overrides,
  };
}

export function makeEpisode(
  overrides: Partial<ExecutionEpisodeSnapshot> = {},
): ExecutionEpisodeSnapshot {
  return {
    episodeId: "episode-1",
    planId: "plan-1",
    planRevision: 2,
    planDigest: "a".repeat(64),
    sessionId: "session-1",
    mainAgentId: "main-1",
    phase: "paused_inconclusive",
    policy: {
      maxTurns: 12,
      maxToolCalls: 80,
      maxNoProgressActions: 16,
      maxEquivalentActions: 3,
      reflectionMaxTurns: 4,
      reflectionMaxToolCalls: 20,
    },
    turnCount: 3,
    toolCallCount: 6,
    noProgressActionCount: 3,
    reflectionUsed: true,
    startedAt: 10,
    updatedAt: 20,
    progress: {
      passedVerificationIds: [],
      planSteps: [{ stepId: "item-1", status: "in_progress" }],
      task: {
        status: "active",
        todos: [{ todoId: "outcome-1", status: "in_progress" }],
      },
    },
    incident: {
      rule: "max_equivalent_actions",
      occurredAt: 20,
      reflectionAvailable: false,
      unchangedProgress: {
        passedVerificationIds: [],
        planSteps: [{ stepId: "item-1", status: "in_progress" }],
        task: {
          status: "active",
          todos: [{ todoId: "outcome-1", status: "in_progress" }],
        },
      },
      equivalentActionCount: 3,
      fingerprint: "b".repeat(64),
      errors: [],
    },
    ...overrides,
  };
}

export function pendingPlan(): PlanRecord {
  return makePlan({
    status: "awaiting_decision",
    pendingInteraction: {
      interactionId: "interaction-1",
      revision: 2,
      planDigest: "a".repeat(64),
      payloadDigest: "b".repeat(64),
      createdAt: 2,
      state: "pending",
      kind: "decision",
      payload: {
        decisionNodeId: "decision-1",
        candidateIds: ["json"],
        prompt: "Choose",
      },
    },
  });
}

export function setupPlanBackend(
  plan: PlanRecord | undefined = pendingPlan(),
  initialEpisode?: ExecutionEpisodeSnapshot,
) {
  const events = new HarnessEventBus({ error: vi.fn() } as never);
  let currentSessionId = "session-1";
  let activePlan: PlanRecord | undefined = plan;
  let latestPlan: PlanRecord | undefined = plan;
  let taskState: TaskState | undefined;
  let episode = initialEpisode;
  const base = createHarnessApiFixture();
  const prompt = vi.fn(base.conversation.prompt);
  const promptWithImages = vi.fn(base.conversation.promptWithImages);
  const submitDecision = vi.fn(base.plans.submitDecision);
  const approve = vi.fn(base.plans.approve);
  const requestReplan = vi.fn(base.plans.requestReplan);
  const cancel = vi.fn(base.plans.cancel);
  const adjustPlan = vi.fn(base.plans.adjustPlan);
  const continueExecution = vi.fn(base.plans.continueExecution);
  const harness = createHarnessApiFixture({
    events,
    conversation: {
      ...base.conversation,
      prompt,
      promptWithImages,
    },
    sessions: {
      ...base.sessions,
      currentId: () => currentSessionId,
      switch: vi.fn(async ({ sessionIdOrPrefix }) => {
        currentSessionId = sessionIdOrPrefix;
        return {
          session: {
            id: sessionIdOrPrefix,
            title: "Target",
            createdAt: 1,
            updatedAt: 2,
            modelProvider: "test",
            modelId: "model",
            messageCount: 0,
            projectPath: "/project",
            preview: "",
            hasImages: false,
            imageCount: 0,
            totalActiveMs: 0,
            contentHash: "",
          },
          messages: [],
          agentMessages: [],
        };
      }),
    },
    plans: {
      ...base.plans,
      getActivePlan: vi.fn(async (sessionId) =>
        sessionId === currentSessionId ? activePlan : undefined
      ),
      getLatestPlan: vi.fn(async (sessionId) =>
        sessionId === currentSessionId ? latestPlan : undefined
      ),
      submitDecision,
      approve,
      requestReplan,
      cancel,
      adjustPlan,
      continueExecution,
      getEpisode: vi.fn(async () => episode),
    },
    tasks: {
      ...base.tasks,
      getTaskState: vi.fn(async (sessionId) =>
        sessionId === currentSessionId ? taskState : undefined
      ),
    },
  });
  const backend = new WebUiBackend({
    webRoot: ".",
    port: 0,
    harness,
  });
  const broadcast = vi.spyOn((backend as any).wsServer, "broadcast");
  const send = vi.fn();
  const client = { send };
  return {
    backend,
    broadcast,
    cancel,
    client,
    events,
    prompt,
    promptWithImages,
    requestReplan,
    submitDecision,
    approve,
    adjustPlan,
    continueExecution,
    setCurrentSessionId(sessionId: string) {
      currentSessionId = sessionId;
    },
    setActivePlan(next: PlanRecord | undefined) {
      activePlan = next;
      latestPlan = next;
    },
    setLatestPlan(next: PlanRecord | undefined) {
      latestPlan = next;
    },
    setTaskState(next: TaskState | undefined) {
      taskState = next;
    },
    setEpisode(next: ExecutionEpisodeSnapshot | undefined) {
      episode = next;
    },
  };
}
