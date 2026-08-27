import type {
  PlanRecord,
  ServerEvent,
} from "./types.js";
import {
  planInteractionRequest,
} from "../../application/plan/interaction-projection.js";

type PlanInteractionEvent = Extract<
  ServerEvent,
  { type: "plan_interaction" }
>;

export type PlanViewInteraction = Omit<
  PlanInteractionEvent,
  "interaction" | "request"
> & {
  interaction: Exclude<
    PlanInteractionEvent["interaction"],
    { kind: "acceptance" }
  >;
  request: NonNullable<PlanInteractionEvent["request"]>;
};

export interface PlanViewConflict {
  planId: string;
  expectedVersion: number;
  currentVersion: number;
  revision: number;
}

export interface PlanViewState {
  plan: Readonly<PlanRecord> | null;
  interaction: PlanViewInteraction | null;
  conflict: PlanViewConflict | null;
}

export const EMPTY_PLAN_VIEW_STATE: PlanViewState = {
  plan: null,
  interaction: null,
  conflict: null,
};

function toPlanViewInteraction(
  event: PlanInteractionEvent,
): PlanViewInteraction | null {
  const { interaction, request } = event;
  if (!request || interaction.kind === "acceptance") return null;
  if (request.interactionId !== interaction.interactionId
    || request.planId !== event.planId
    || request.revision !== interaction.revision
    || event.revision !== interaction.revision) return null;
  if (interaction.kind === "decision" && !("decisionNodeId" in request)) {
    return null;
  }
  if (interaction.kind === "approval" && !("digest" in request)) return null;
  return event as PlanViewInteraction;
}

function currentSnapshotInteraction(
  state: PlanViewState,
): PlanViewInteraction | null {
  const { plan, interaction } = state;
  const pending = plan?.pendingInteraction;
  if (!plan || !interaction || !pending
    || interaction.planId !== plan.planId
    || interaction.revision !== plan.revision
    || interaction.interaction.interactionId !== pending.interactionId
    || interaction.interaction.payloadDigest !== pending.payloadDigest) {
    return null;
  }
  return toPlanViewInteraction(interaction);
}

function clearMismatchedTransientState(state: PlanViewState): PlanViewState {
  const interaction = currentSnapshotInteraction(state);
  if (interaction === state.interaction && state.conflict === null) return state;
  return { ...state, interaction, conflict: null };
}

function clearTransientState(state: PlanViewState): PlanViewState {
  if (state.interaction === null && state.conflict === null) return state;
  return { ...state, interaction: null, conflict: null };
}

function projectPendingInteraction(
  plan: Readonly<PlanRecord>,
): PlanViewInteraction | null {
  const interaction = plan.pendingInteraction;
  if (!interaction) return null;
  const request = planInteractionRequest(plan, interaction);
  return toPlanViewInteraction({
    type: "plan_interaction",
    planId: plan.planId,
    version: plan.version,
    revision: plan.revision,
    interaction,
    request,
  });
}

export function planViewReducer(
  state: PlanViewState,
  event: ServerEvent,
): PlanViewState {
  switch (event.type) {
    case "plan_state": {
      if (!event.plan) return { ...EMPTY_PLAN_VIEW_STATE };
      if (state.plan?.planId === event.plan.planId
        && state.plan.version > event.plan.version) return state;
      const nextState: PlanViewState = {
        plan: event.plan,
        interaction: state.interaction,
        conflict: null,
      };
      return {
        ...nextState,
        interaction: currentSnapshotInteraction(nextState),
      };
    }
    case "plan_interaction":
      if (state.plan?.planId !== event.planId) {
        return clearTransientState(state);
      }
      if (state.plan.version > event.version) {
        return clearMismatchedTransientState(state);
      }
      return {
        ...state,
        interaction: toPlanViewInteraction(event),
        conflict: null,
      };
    case "plan_conflict":
      if (state.plan?.planId !== event.planId
        || state.plan.sessionId !== event.plan.sessionId
        || event.plan.planId !== event.planId) {
        return clearTransientState(state);
      }
      if (state.plan.version > event.currentVersion) {
        return clearMismatchedTransientState(state);
      }
      const pending = event.plan.pendingInteraction;
      const interaction = state.interaction;
      const interactionStillPending = interaction?.planId === event.plan.planId
        && interaction.revision === event.plan.revision
        && interaction.interaction.interactionId === pending?.interactionId
        && interaction.interaction.payloadDigest === pending.payloadDigest;
      const currentInteraction = interactionStillPending
        ? toPlanViewInteraction(interaction)
        : null;
      return {
        plan: event.plan,
        interaction: currentInteraction ?? projectPendingInteraction(event.plan),
        conflict: {
          planId: event.planId,
          expectedVersion: event.expectedVersion,
          currentVersion: event.currentVersion,
          revision: event.revision,
        },
      };
    default:
      return state;
  }
}
