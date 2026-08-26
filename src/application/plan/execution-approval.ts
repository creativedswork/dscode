import type { ToolEffect } from "../../kernel/tool-effects.js";
import { assertCompiledPlan } from "./compiler.js";
import type {
  PlanApprovalCommand,
  PlanExecutionMutationResult,
  PlanItemBindingCommand,
} from "./execution-types.js";
import {
  itemBindings,
  mutationFailure,
  PlanDomainError,
  requireCurrentApproval,
  requireItem,
} from "./execution-rules.js";
import { PlanStore } from "./store.js";
import type { PlanExecutionBinding } from "./types.js";

export class PlanExecutionApproval {
  constructor(
    private readonly store: PlanStore,
    private readonly now: () => number = Date.now,
  ) {}

  async approve(command: PlanApprovalCommand): Promise<PlanExecutionMutationResult> {
    try {
      const loaded = await this.store.load(command.planId);
      if (
        loaded.ok
        && loaded.plan
        && (
          loaded.plan.revision !== command.revision
          || loaded.plan.digest !== command.digest
        )
      ) {
        return {
          ok: false,
          reason: "stale_approval",
          message: "Approval revision or digest is stale",
          plan: loaded.plan,
        };
      }
      if (loaded.ok && loaded.plan) {
        this.assertCompiled(loaded.plan);
      }
      const outcome = await this.store.applyCommand({
        ...command,
        operation: "approve",
        payload: {
          revision: command.revision,
          digest: command.digest,
          acknowledgedEffects: command.acknowledgedEffects,
        },
      }, (draft) => {
        if (draft.status !== "awaiting_approval") {
          throw new PlanDomainError("invalid_transition", "Plan is not awaiting approval");
        }
        this.assertCompiled(draft);
        if (
          draft.revision !== command.revision
          || draft.digest !== command.digest
          || draft.pendingInteraction?.kind !== "approval"
          || draft.pendingInteraction.interactionId !== command.interactionId
        ) {
          throw new PlanDomainError("stale_approval", "Approval revision or digest is stale");
        }
        const required = [...new Set(draft.items.flatMap((item) =>
          item.effectGrants.map((grant) => grant.effect)
        ))].filter((effect) => effect !== "read").sort();
        const acknowledged = [...new Set(command.acknowledgedEffects)].sort();
        if (
          required.length !== acknowledged.length
          || required.some((effect) => !acknowledged.includes(effect))
        ) {
          throw new PlanDomainError(
            "invalid_command",
            "Every planned side-effect category must be acknowledged",
          );
        }
        draft.approval = {
          revision: draft.revision,
          digest: draft.digest,
          approvedEffects: required,
          acknowledgedSideEffects: acknowledged,
          acknowledgementReceiptCommandId: command.commandId,
          interactionId: command.interactionId,
          approvedAt: this.now(),
        };
        draft.status = "approved";
      });
      if (!outcome.ok) {
        return {
          ok: false,
          reason: outcome.reason === "conflict" ? "conflict" : "invalid_command",
          message: "Approval command was rejected",
          ...("plan" in outcome ? { plan: outcome.plan } : {}),
        };
      }
      return { ok: true, plan: outcome.plan, duplicate: outcome.duplicate };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  async bindItem(command: PlanItemBindingCommand): Promise<PlanExecutionMutationResult> {
    try {
      const result = await this.store.update(
        command.planId,
        command.expectedVersion,
        (draft) => {
          if (draft.status !== "approved" && draft.status !== "executing") {
            throw new PlanDomainError("invalid_transition", "Plan is not executable");
          }
          requireCurrentApproval(draft, command.revision, command.digest);
          const item = requireItem(draft, command.itemId);
          if (!["pending", "blocked", "in_progress"].includes(item.status)) {
            throw new PlanDomainError("invalid_transition", "Plan item cannot be bound");
          }
          if (item.dependsOn.some((dependency) =>
            draft.items.find((candidate) => candidate.itemId === dependency)
              ?.status !== "completed"
          )) {
            throw new PlanDomainError(
              "invalid_transition",
              "Plan item dependencies are incomplete",
            );
          }
          const binding: PlanExecutionBinding = {
            agentId: command.agentId,
            role: command.role,
            planId: draft.planId,
            revision: draft.revision,
            digest: draft.digest,
            itemId: item.itemId,
            boundAt: this.now(),
          };
          item.executionBindings = [
            ...itemBindings(item).filter((candidate) =>
              candidate.agentId !== command.agentId
            ),
            binding,
          ];
          item.executionBinding = undefined;
          item.status = "in_progress";
          draft.status = "executing";
        },
      );
      return result.ok
        ? { ok: true, plan: result.plan }
        : { ok: false, reason: "conflict", message: "Plan version conflict" };
    } catch (error) {
      return mutationFailure(error);
    }
  }

  static effectAcknowledgements(effects: readonly ToolEffect[]): ToolEffect[] {
    return [...new Set(effects)].sort();
  }

  private assertCompiled(plan: Parameters<typeof assertCompiledPlan>[0]): void {
    try {
      assertCompiledPlan(plan, this.store.projectPath);
    } catch (error) {
      throw new PlanDomainError(
        "invalid_command",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
