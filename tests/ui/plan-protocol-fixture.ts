import { vi } from "vitest";

import { HarnessEventBus } from "../../src/application/events.js";
import type { PlanRecord } from "../../src/application/plan/index.js";
import { WebUiBackend } from "../../src/ui/web/web-backend.js";
import { makePlanInput } from "../application/plan/helpers.js";
import { createHarnessApiFixture } from "../helpers/harness-api.js";

export function makePlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    ...makePlanInput(),
    schemaVersion: 1,
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

export function setupPlanBackend(plan: PlanRecord | undefined = pendingPlan()) {
  const events = new HarnessEventBus({ error: vi.fn() } as never);
  let currentSessionId = "session-1";
  let activePlan: PlanRecord | undefined = plan;
  const base = createHarnessApiFixture();
  const prompt = vi.fn(base.conversation.prompt);
  const promptWithImages = vi.fn(base.conversation.promptWithImages);
  const submitDecision = vi.fn(base.plans.submitDecision);
  const approve = vi.fn(base.plans.approve);
  const requestReplan = vi.fn(base.plans.requestReplan);
  const cancel = vi.fn(base.plans.cancel);
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
      submitDecision,
      approve,
      requestReplan,
      cancel,
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
    setCurrentSessionId(sessionId: string) {
      currentSessionId = sessionId;
    },
    setActivePlan(next: PlanRecord | undefined) {
      activePlan = next;
    },
  };
}
