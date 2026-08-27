import type {
  PlanCommandReceipt,
  PlanInteraction,
  PlanRecord,
} from "./types.js";

export type NewPlanRecord = Omit<
  PlanRecord,
  | "schemaVersion"
  | "projectKey"
  | "version"
  | "revision"
  | "digest"
  | "commandReceipts"
  | "createdAt"
  | "updatedAt"
>;

export interface PlanConflict {
  kind: "version";
  expectedVersion: number;
  currentVersion: number;
  current: Readonly<PlanRecord>;
}

export interface PlanMutationObserver {
  committed(
    plan: Readonly<PlanRecord>,
    previous?: Readonly<PlanRecord>,
  ): void;
  conflicted(conflict: PlanConflict): void;
}

export type PlanStoreMutationResult =
  | { ok: true; plan: Readonly<PlanRecord> }
  | { ok: false; reason: "conflict"; conflict: PlanConflict };

type InteractionRuntimeFields =
  | "revision"
  | "planDigest"
  | "payloadDigest"
  | "state";

export type NewPlanInteraction =
  | Omit<Extract<PlanInteraction, { kind: "decision" }>, InteractionRuntimeFields>
  | Omit<Extract<PlanInteraction, { kind: "approval" }>, InteractionRuntimeFields>
  | Omit<Extract<PlanInteraction, { kind: "acceptance" }>, InteractionRuntimeFields>;

export interface PlanCommand {
  planId: string;
  expectedVersion: number;
  commandId: string;
  payload: unknown;
  operation: string;
  interactionId?: string;
  interactionPayloadDigest?: string;
}

export type PlanCommandMutationResult =
  | {
      ok: true;
      plan: Readonly<PlanRecord>;
      receipt: Readonly<PlanCommandReceipt>;
      duplicate: boolean;
    }
  | { ok: false; reason: "conflict"; conflict: PlanConflict }
  | {
      ok: false;
      reason: "command_id_reused" | "interaction_not_pending" | "interaction_digest_mismatch";
      message: string;
      plan: Readonly<PlanRecord>;
      receipt?: Readonly<PlanCommandReceipt>;
    };

export type PlanLoadResult =
  | { ok: true; plan?: Readonly<PlanRecord> }
  | { ok: false; reason: "corrupt"; quarantinePath: string; message: string };
