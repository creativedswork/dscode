import type {
  ClientCommand,
  PlanViewState,
} from "../types";

export type IntentAlignmentAnswer =
  | { kind: "select"; optionId: string }
  | { kind: "custom"; text: string };

function newCommandId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `alignment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildIntentAlignmentCommand(
  state: PlanViewState,
  sessionId: string | null,
  answer: IntentAlignmentAnswer,
  commandId = newCommandId(),
): Extract<ClientCommand, { type: "plan_decision" }> | null {
  const plan = state.plan;
  const interaction = state.interaction;
  if (
    !plan
    || !sessionId
    || plan.sessionId !== sessionId
    || !interaction
    || interaction.interaction.kind !== "decision"
  ) return null;
  if (answer.kind === "custom" && !answer.text.trim()) return null;

  const action = answer.kind === "select"
    ? {
        kind: "select" as const,
        decisionNodeId: interaction.request.decisionNodeId,
        optionId: answer.optionId,
      }
    : {
        kind: "update_constraints" as const,
        constraints: [{
          kind: "set" as const,
          constraint: {
            constraintId: `alignment:${interaction.interaction.interactionId}`,
            kind: "preference" as const,
            description: answer.text.trim(),
            source: "user" as const,
          },
        }],
      };
  return {
    type: "plan_decision",
    sessionId,
    planId: plan.planId,
    expectedVersion: plan.version,
    commandId,
    interactionId: interaction.interaction.interactionId,
    interactionPayloadDigest: interaction.interaction.payloadDigest,
    action,
  };
}
