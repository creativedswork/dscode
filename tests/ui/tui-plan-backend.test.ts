import { describe, expect, it, vi } from "vitest";

import { HarnessEventBus } from "../../src/application/events.js";
import { planInteractionRequest } from "../../src/application/plan/interaction-projection.js";
import type { PlanRecord } from "../../src/application/plan/types.js";
import { createHarnessApiFixture } from "../helpers/harness-api.js";
import { makeEpisode, makePlan, pendingPlan } from "./plan-protocol-fixture.js";

vi.mock("../../src/ui/tui/app.js", () => ({
  TuiApp: class {
    applyConversationEvent = vi.fn();
    addRetry = vi.fn();
    addInfo = vi.fn();
    addError = vi.fn();
    addWarning = vi.fn();
    addPendingImage = vi.fn();
    focusEditor = vi.fn();
    finishAssistantTurnMetadata = vi.fn();
    setProcessing = vi.fn();
    upsertAgentActivity = vi.fn();
    syncPlanState = vi.fn();
    start = vi.fn();
    waitForExit = vi.fn();
    handleInterrupt = vi.fn();
    getPromptPermission = vi.fn();
  },
}));

import { TuiBackend } from "../../src/ui/tui/backend.js";

function authorizedPlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return makePlan({
    status: "approved",
    approval: {
      revision: 2,
      digest: "a".repeat(64),
      approvedEffects: [],
      acknowledgedSideEffects: [],
      interactionId: "internal:planner-1",
      approvedAt: 10,
    },
    ...overrides,
  });
}

function setup() {
  const events = new HarnessEventBus({ error: vi.fn() } as never);
  let active = pendingPlan();
  const base = createHarnessApiFixture();
  const harness = createHarnessApiFixture({
    events,
    sessions: {
      ...base.sessions,
      currentId: () => "session-1",
    },
    plans: {
      ...base.plans,
      getActivePlan: vi.fn(async () => active),
    },
  });
  const backend = new TuiBackend(harness);
  const tui = (backend as any).tui;
  return {
    events,
    tui,
    setActive(plan: typeof active) {
      active = plan;
    },
  };
}

describe("TUI Plan backend", () => {
  it("projects updates and conflicts only for the selected Session", () => {
    const fixture = setup();
    const selected = authorizedPlan({ sessionId: "session-1" });
    const other = authorizedPlan({ sessionId: "session-2" });

    fixture.events.emit({
      type: "plan:updated",
      planId: selected.planId,
      version: selected.version,
      revision: selected.revision,
      plan: selected,
    });
    fixture.events.emit({
      type: "plan:updated",
      planId: other.planId,
      version: other.version,
      revision: other.revision,
      plan: other,
    });
    fixture.events.emit({
      type: "plan:conflict",
      planId: selected.planId,
      expectedVersion: 2,
      currentVersion: selected.version,
      revision: selected.revision,
      conflict: {
        kind: "version",
        expectedVersion: 2,
        currentVersion: selected.version,
        current: selected,
      },
      plan: selected,
    });

    expect(fixture.tui.applyConversationEvent.mock.calls).toEqual([
      [{ type: "plan_state", plan: selected }],
      [expect.objectContaining({
        type: "plan_conflict",
        plan: selected,
      })],
    ]);
  });

  it("projects a pending interaction after checking the active Plan", async () => {
    const fixture = setup();
    const plan = pendingPlan();
    fixture.setActive(plan);
    const interaction = plan.pendingInteraction;
    if (!interaction) throw new Error("interaction missing");
    const request = planInteractionRequest(plan, interaction);

    fixture.events.emit({
      type: "plan:interaction",
      planId: plan.planId,
      version: plan.version,
      revision: plan.revision,
      interaction,
      request,
    });

    await vi.waitFor(() => {
      expect(fixture.tui.applyConversationEvent).toHaveBeenCalledWith({
        type: "plan_interaction",
        planId: plan.planId,
        version: plan.version,
        revision: plan.revision,
        interaction,
        request,
      });
    });
  });

  it("projects authoritative episode and impasse events", () => {
    const fixture = setup();
    const episode = makeEpisode();

    fixture.events.emit({
      type: "plan:episode",
      planId: episode.planId,
      episode,
    });
    fixture.events.emit({
      type: "plan:impasse",
      planId: episode.planId,
      episodeId: episode.episodeId,
      incident: episode.incident!,
    });

    expect(fixture.tui.applyConversationEvent).toHaveBeenNthCalledWith(1, {
      type: "plan_episode",
      planId: episode.planId,
      episode,
    });
    expect(fixture.tui.applyConversationEvent).toHaveBeenNthCalledWith(2, {
      type: "plan_impasse",
      planId: episode.planId,
      episodeId: episode.episodeId,
      incident: episode.incident,
    });
  });
});
