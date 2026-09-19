import type { PlanDecisionCommand } from "../../application/plan/plan-port.js";
import type { TuiPlanState } from "./plan-view.js";

export type TuiPlanAnswer =
  | { kind: "select"; optionId: string }
  | { kind: "custom"; text: string };

export function buildTuiPlanDecisionCommand(
  state: TuiPlanState,
  sessionId: string | undefined,
  answer: TuiPlanAnswer,
  commandId: string,
): PlanDecisionCommand | null {
  const plan = state.view.plan;
  const interaction = state.view.interaction;
  if (
    !plan
    || !sessionId
    || plan.sessionId !== sessionId
    || !interaction
  ) return null;
  if (answer.kind === "custom" && !answer.text.trim()) return null;

  return {
    planId: plan.planId,
    expectedVersion: plan.version,
    commandId,
    interactionId: interaction.interaction.interactionId,
    interactionPayloadDigest: interaction.interaction.payloadDigest,
    action: answer.kind === "select"
      ? {
          kind: "select",
          decisionNodeId: interaction.request.decisionNodeId,
          optionId: answer.optionId,
        }
      : {
          kind: "update_constraints",
          constraints: [{
            kind: "set",
            constraint: {
              constraintId:
                `alignment:${interaction.interaction.interactionId}`,
              kind: "preference",
              description: answer.text.trim(),
              source: "user",
            },
          }],
        },
  };
}
