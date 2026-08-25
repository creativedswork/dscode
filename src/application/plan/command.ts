import type {
  PlanCommand,
  PlanCommandMutationResult,
} from "./store-types.js";
import type { PlanRecord } from "./types.js";

export function findCommandOutcome(
  command: PlanCommand,
  current: PlanRecord,
  payloadDigest: string,
): PlanCommandMutationResult | undefined {
  const prior = current.commandReceipts.find(
    (receipt) => receipt.commandId === command.commandId,
  );
  if (prior) {
    if (prior.payloadDigest !== payloadDigest) {
      return {
        ok: false,
        reason: "command_id_reused",
        message: `Command ${command.commandId} was reused with a different payload`,
        plan: current,
        receipt: prior,
      };
    }
    return { ok: true, plan: current, receipt: prior, duplicate: true };
  }
  if (!command.interactionId && !command.interactionPayloadDigest) return undefined;
  if (!command.interactionId || !command.interactionPayloadDigest) {
    return {
      ok: false,
      reason: "interaction_digest_mismatch",
      message: "Interaction ID and payload digest must be provided together",
      plan: current,
    };
  }
  const consumed = current.commandReceipts.find(
    (receipt) => receipt.interactionId === command.interactionId,
  );
  if (consumed) {
    return {
      ok: false,
      reason: "interaction_not_pending",
      message: `Interaction ${command.interactionId} was already consumed`,
      plan: current,
      receipt: consumed,
    };
  }
  if (current.pendingInteraction?.interactionId !== command.interactionId) {
    return {
      ok: false,
      reason: "interaction_not_pending",
      message: `Interaction ${command.interactionId} is not pending`,
      plan: current,
    };
  }
  if (current.pendingInteraction.payloadDigest !== command.interactionPayloadDigest) {
    return {
      ok: false,
      reason: "interaction_digest_mismatch",
      message: `Interaction ${command.interactionId} payload digest does not match`,
      plan: current,
    };
  }
  return undefined;
}
