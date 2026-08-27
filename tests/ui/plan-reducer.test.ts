import { describe, expect, it } from "vitest";

import { planInteractionRequest } from "../../src/application/plan/interaction-projection.js";
import {
  EMPTY_PLAN_VIEW_STATE,
  planViewReducer,
} from "../../src/ui/shared/plan-reducer.js";
import type { PlanViewState } from "../../src/ui/shared/plan-reducer.js";
import { conversationReducer } from "../../src/ui/shared/reducer.js";
import type {
  PlanRecord,
  ServerEvent,
  UIMessage,
} from "../../src/ui/shared/types.js";
import {
  makePlan,
  pendingPlan,
} from "./plan-protocol-fixture.js";

type PlanInteractionEvent = Extract<
  ServerEvent,
  { type: "plan_interaction" }
>;

function interactionEvent(plan: PlanRecord): PlanInteractionEvent {
  const interaction = plan.pendingInteraction;
  if (!interaction) throw new Error("Expected a pending interaction");
  const request = planInteractionRequest(plan, interaction);
  if (!request) throw new Error("Expected a typed interaction request");
  return {
    type: "plan_interaction",
    planId: plan.planId,
    version: plan.version,
    revision: plan.revision,
    interaction,
    request,
  };
}

describe("PlanViewState reducer", () => {
  it("keeps Plan state separate from the conversation transcript", () => {
    const plan = pendingPlan();
    const messages: UIMessage[] = [{
      id: "user-1",
      role: "user",
      content: "Plan this",
    }];
    const event: ServerEvent = { type: "plan_state", plan };

    const state = planViewReducer(EMPTY_PLAN_VIEW_STATE, event);

    expect(state.plan).toBe(plan);
    expect(conversationReducer(messages, event)).toBe(messages);
  });

  it("tracks interactions and authoritative conflicts, then clears by Session", () => {
    const plan = pendingPlan();
    let state = planViewReducer(EMPTY_PLAN_VIEW_STATE, {
      type: "plan_state",
      plan,
    });
    state = planViewReducer(state, interactionEvent(plan));
    expect(state.interaction).toMatchObject({
      type: "plan_interaction",
      interaction: { interactionId: "interaction-1" },
    });
    const current = makePlan({
      version: 4,
      revision: 3,
      pendingInteraction: undefined,
    });
    state = planViewReducer(state, {
      type: "plan_conflict",
      planId: current.planId,
      expectedVersion: 3,
      currentVersion: 4,
      revision: 3,
      plan: current,
    });

    expect(state).toMatchObject({
      plan: { version: 4, revision: 3 },
      interaction: null,
      conflict: { expectedVersion: 3, currentVersion: 4, revision: 3 },
    });
    expect(planViewReducer(state, { type: "plan_state", plan: null }))
      .toEqual(EMPTY_PLAN_VIEW_STATE);
  });

  it("preserves an interaction that remains pending in a conflict snapshot", () => {
    const plan = pendingPlan();
    let state = planViewReducer(EMPTY_PLAN_VIEW_STATE, {
      type: "plan_state",
      plan,
    });
    state = planViewReducer(state, interactionEvent(plan));
    const interaction = state.interaction;
    const current = pendingPlan();
    current.version = 4;

    state = planViewReducer(state, {
      type: "plan_conflict",
      planId: current.planId,
      expectedVersion: 2,
      currentVersion: current.version,
      revision: current.revision,
      plan: current,
    });

    expect(state.plan).toBe(current);
    expect(state.interaction).toBe(interaction);
    expect(state.conflict).toMatchObject({
      expectedVersion: 2,
      currentVersion: 4,
    });
  });

  it("restores typed decision and approval interactions from conflict snapshots", () => {
    const decision = pendingPlan();
    const approval = makePlan({
      status: "awaiting_approval",
      pendingInteraction: {
        interactionId: "approval-1",
        revision: 2,
        planDigest: "a".repeat(64),
        payloadDigest: "c".repeat(64),
        createdAt: 3,
        state: "pending",
        kind: "approval",
        payload: {
          itemIds: ["item-1"],
          effectCategories: ["workspace_write"],
          sideEffectSummary: "Write the snapshot",
        },
      },
    });

    const restore = (plan: PlanRecord) => {
      const state = {
        ...planViewReducer(EMPTY_PLAN_VIEW_STATE, {
          type: "plan_state" as const,
          plan,
        }),
        interaction: null,
      };
      const current = makePlan({
        ...plan,
        version: plan.version + 1,
      });
      return planViewReducer(state, {
        type: "plan_conflict",
        planId: current.planId,
        expectedVersion: plan.version,
        currentVersion: current.version,
        revision: current.revision,
        plan: current,
      });
    };

    expect(restore(decision).interaction).toMatchObject({
      type: "plan_interaction",
      interaction: { kind: "decision", interactionId: "interaction-1" },
      request: {
        interactionId: "interaction-1",
        decisionNodeId: "decision-1",
        candidates: [{ optionId: "json" }],
      },
    });
    expect(restore(approval).interaction).toMatchObject({
      type: "plan_interaction",
      interaction: { kind: "approval", interactionId: "approval-1" },
      request: {
        interactionId: "approval-1",
        digest: approval.digest,
        items: [{ itemId: "item-1" }],
        effectCategories: ["workspace_write"],
      },
    });
  });

  it("does not store direct acceptance or interactions without typed requests", () => {
    const plan = pendingPlan();
    const decisionEvent = interactionEvent(plan);
    const acceptance = makePlan({
      status: "executing",
      pendingInteraction: {
        interactionId: "acceptance-1",
        revision: plan.revision,
        planDigest: plan.digest,
        payloadDigest: "d".repeat(64),
        createdAt: 3,
        state: "pending",
        kind: "acceptance",
        payload: {
          itemId: "item-1",
          criterionId: "criterion-1",
          prompt: "Confirm",
        },
      },
    });
    const state = planViewReducer(EMPTY_PLAN_VIEW_STATE, {
      type: "plan_state",
      plan,
    });

    expect(planViewReducer(state, {
      ...decisionEvent,
      interaction: acceptance.pendingInteraction!,
    }).interaction).toBeNull();
    expect(planViewReducer(state, {
      ...decisionEvent,
      request: undefined,
    }).interaction).toBeNull();
  });

  it("rejects typed requests that cross interaction identity, Plan, revision, or kind", () => {
    const plan = pendingPlan();
    const event = interactionEvent(plan);
    const approval = makePlan({
      status: "awaiting_approval",
      pendingInteraction: {
        ...plan.pendingInteraction!,
        interactionId: "approval-1",
        kind: "approval",
        payload: {
          itemIds: ["item-1"],
          effectCategories: ["workspace_write"],
          sideEffectSummary: "Write the snapshot",
        },
      },
    });
    const approvalRequest = interactionEvent(approval).request;
    if (!event.request || !("decisionNodeId" in event.request)) {
      throw new Error("Expected a decision request");
    }
    if (!approvalRequest || !("digest" in approvalRequest)) {
      throw new Error("Expected an approval request");
    }
    const state = planViewReducer(EMPTY_PLAN_VIEW_STATE, {
      type: "plan_state",
      plan,
    });
    const mismatchedRequests: PlanInteractionEvent["request"][] = [
      { ...event.request, interactionId: "interaction-2" },
      { ...event.request, planId: "plan-2" },
      { ...event.request, revision: event.request.revision + 1 },
      { ...approvalRequest, interactionId: event.interaction.interactionId },
    ];

    for (const request of mismatchedRequests) {
      expect(planViewReducer(state, { ...event, request }).interaction)
        .toBeNull();
    }
  });

  it("clears existing transient state when an event mismatches Plan or Session", () => {
    const plan = pendingPlan();
    const interaction = planViewReducer(
      planViewReducer(EMPTY_PLAN_VIEW_STATE, {
        type: "plan_state",
        plan,
      }),
      interactionEvent(plan),
    ).interaction;
    if (!interaction) throw new Error("Expected a projected interaction");
    const conflict = {
      planId: plan.planId,
      expectedVersion: plan.version - 1,
      currentVersion: plan.version,
      revision: plan.revision,
    };
    const validState: PlanViewState = { plan, interaction, conflict };
    const otherPlan = pendingPlan();
    otherPlan.planId = "plan-2";

    const afterOtherPlan = planViewReducer(
      validState,
      interactionEvent(otherPlan),
    );

    expect(afterOtherPlan.plan).toBe(plan);
    expect(afterOtherPlan.interaction).toBeNull();
    expect(afterOtherPlan.conflict).toBeNull();

    const staleState: PlanViewState = {
      plan: makePlan({ pendingInteraction: undefined }),
      interaction,
      conflict,
    };
    const otherSession = makePlan({ sessionId: "session-2" });
    const afterOtherSession = planViewReducer(staleState, {
      type: "plan_conflict",
      planId: staleState.plan!.planId,
      expectedVersion: staleState.plan!.version,
      currentVersion: otherSession.version,
      revision: otherSession.revision,
      plan: otherSession,
    });

    expect(afterOtherSession.plan).toBe(staleState.plan);
    expect(afterOtherSession.interaction).toBeNull();
    expect(afterOtherSession.conflict).toBeNull();
  });

  it("does not project acceptance or a conflict for another Plan or Session", () => {
    const plan = pendingPlan();
    const state = planViewReducer(EMPTY_PLAN_VIEW_STATE, {
      type: "plan_state",
      plan,
    });
    const acceptance = makePlan({
      status: "executing",
      pendingInteraction: {
        interactionId: "acceptance-1",
        revision: plan.revision,
        planDigest: plan.digest,
        payloadDigest: "d".repeat(64),
        createdAt: 3,
        state: "pending",
        kind: "acceptance",
        payload: {
          itemId: "item-1",
          criterionId: "criterion-1",
          prompt: "Confirm",
        },
      },
    });
    const otherSession = pendingPlan();
    otherSession.sessionId = "session-2";
    const decisionEvent = interactionEvent(plan);
    const legacyAcceptanceState: PlanViewState = {
      plan: acceptance,
      interaction: {
        ...decisionEvent,
        interaction: acceptance.pendingInteraction!,
      } as unknown as PlanViewState["interaction"],
      conflict: null,
    };

    const conflict = (
      snapshot: PlanRecord,
      planId = snapshot.planId,
      currentState = state,
    ) =>
      planViewReducer(currentState, {
        type: "plan_conflict",
        planId,
        expectedVersion: 2,
        currentVersion: snapshot.version,
        revision: snapshot.revision,
        plan: snapshot,
      });

    expect(conflict(acceptance).interaction).toBeNull();
    expect(conflict(
      makePlan({ ...acceptance, version: acceptance.version + 1 }),
      acceptance.planId,
      legacyAcceptanceState,
    ).interaction).toBeNull();
    expect(conflict(otherSession)).toBe(state);
    expect(conflict(pendingPlan(), "other-plan")).toBe(state);
  });

  it("ignores stale state and interaction events", () => {
    const current = makePlan({ version: 4 });
    const state = planViewReducer(EMPTY_PLAN_VIEW_STATE, {
      type: "plan_state",
      plan: current,
    });

    expect(planViewReducer(state, {
      type: "plan_state",
      plan: makePlan({ version: 3 }),
    })).toBe(state);
    expect(planViewReducer(state, {
      type: "plan_interaction",
      planId: current.planId,
      version: 3,
      revision: 2,
      interaction: pendingPlan().pendingInteraction!,
    })).toBe(state);
  });

  it("ignores delayed conflicts after Session cleanup", () => {
    const plan = pendingPlan();
    const state = planViewReducer(
      planViewReducer(EMPTY_PLAN_VIEW_STATE, {
        type: "plan_state",
        plan,
      }),
      { type: "plan_state", plan: null },
    );

    expect(planViewReducer(state, {
      type: "plan_conflict",
      planId: plan.planId,
      expectedVersion: 2,
      currentVersion: plan.version,
      revision: plan.revision,
      plan,
    })).toBe(state);
  });
});
