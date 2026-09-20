import type {
  PlanCancelCommand,
  PlanExecutionMutationResult,
  PlanMaterialConflictCommand,
  PlanRequestedReplanCommand,
  PlanReplanTransitionCommand,
  PlanToolAuthorization,
  PlanToolAuthorizationResult,
} from "./execution-types.js";
import {
  PlanExecutionLifecycle,
  type PlanExecutionLifecycleCallbacks,
} from "./execution-lifecycle.js";
import {
  classifyToolOutcome,
  summarizeToolResult,
} from "./execution-outcome.js";
import { allPersistedVerificationsPassed } from "./execution-acceptance.js";
import { retainVerificationEvidence } from "./evidence-retention.js";
import { planExecutionUnits } from "./execution-model.js";
import {
  itemBindings,
  PlanDomainError,
  requireCurrentApproval,
  requireStep,
  requireStepState,
} from "./execution-rules.js";
import { resourceScopeCovers } from "./resource-scope.js";
import { PlanStore } from "./store.js";
import type {
  PlanEvidence,
  PlanExecutionBinding,
  PlanRecord,
} from "./types.js";
import type { ToolEffect } from "../../kernel/tool-effects.js";

export class PlanExecutionRuntime {
  private readonly lifecycle: PlanExecutionLifecycle;

  constructor(
    private readonly store: PlanStore,
    replan: (
      command: PlanReplanTransitionCommand,
    ) => Promise<PlanExecutionMutationResult>,
    callbacks: PlanExecutionLifecycleCallbacks,
    private readonly now: () => number = Date.now,
  ) {
    this.lifecycle = new PlanExecutionLifecycle(store, replan, callbacks, now);
  }

  hasInFlight(planId: string): boolean {
    return this.lifecycle.hasInFlight(planId);
  }

  resume(planId: string): void {
    this.lifecycle.resume(planId);
  }

  async authorizeTool(
    authorization: PlanToolAuthorization,
  ): Promise<PlanToolAuthorizationResult> {
    let plan = await this.requirePlan(authorization.binding.planId);
    if (!plan) {
      return { ok: false, reason: "stale_binding", message: "Bound Plan is unavailable" };
    }
    if (authorization.binding.role === "subagent") {
      plan = await this.ensureSubagentBinding(plan, authorization.binding);
    }
    if (this.lifecycle.isCancelling(plan.planId) || plan.status !== "executing") {
      return {
        ok: false,
        reason: "invalid_transition",
        message: "Plan is not scheduling side effects",
        plan,
      };
    }
    try {
      requireCurrentApproval(
        plan,
        authorization.binding.revision,
        authorization.binding.digest,
      );
    } catch {
      return { ok: false, reason: "stale_binding", message: "Execution binding is stale", plan };
    }
    const item = planExecutionUnits(plan).find((candidate) =>
      candidate.stepId === authorization.binding.itemId
    );
    if (
      !item
      || item.status !== "in_progress"
      || !itemBindings(item).some((candidate) =>
        candidate.agentId === authorization.binding.agentId
        && candidate.role === authorization.binding.role
      )
    ) {
      return { ok: false, reason: "stale_binding", message: "Agent is not bound to item", plan };
    }
    if (
      authorization.effect === "process"
      && authorization.toolName === "bash"
      && authorization.resourceScopes.length === 0
    ) {
      const commands = item.verifications.flatMap((verification) =>
        verification.kind === "command" ? [verification.command] : []
      );
      return {
        ok: false,
        reason: "invalid_command",
        message: commands.length > 0
          ? `Run each command separately and exactly as stored: ${commands.join(", ")}`
          : "Run one simple shell command without chaining, pipes, redirects, or substitutions",
        plan,
      };
    }
    const grants = item.effectGrants.filter((grant) =>
      grant.effect === authorization.effect
    );
    if (grants.length === 0) {
      return {
        ok: false,
        reason: "effect_mismatch",
        message: "Effect is outside Plan approval",
        plan,
      };
    }
    const covered = authorization.resourceScopes.length > 0
      && authorization.resourceScopes.every((actual) =>
        grants.some((grant) => grant.resourceScopes.some((scope) =>
          resourceScopeCovers(scope, actual)
        ))
      );
    if (!covered) {
      return {
        ok: false,
        reason: "scope_mismatch",
        message: "Resource is outside Plan approval",
        plan,
      };
    }
    this.lifecycle.startTool(plan.planId);
    return { ok: true, plan };
  }

  async recordToolResult(
    binding: PlanExecutionBinding,
    toolCallId: string,
    toolName: string,
    args: unknown,
    result: unknown,
    isError: boolean,
    effect?: ToolEffect,
    settleLifecycle = effect !== "read",
  ): Promise<void> {
    try {
      const details = result && typeof result === "object"
        ? (result as { details?: { exitCode?: unknown } }).details
        : undefined;
      const exitCode = typeof details?.exitCode === "number" ? details.exitCode : undefined;
      const output = summarizeToolResult(result);
      const classifiedOutcome = classifyToolOutcome(result, isError, exitCode);
      await this.appendEvidence(binding, {
        planId: binding.planId,
        revision: binding.revision,
        itemId: binding.itemId,
        kind: "tool_result",
        evidenceId: `tool-${toolCallId}`,
        toolCallId,
        toolName,
        isError,
        ...(exitCode === undefined ? {} : { exitCode }),
        ...(toolName === "bash"
          && args
          && typeof args === "object"
          && typeof (args as { command?: unknown }).command === "string"
          ? { command: (args as { command: string }).command }
          : {}),
        acceptanceEligible: true,
        output,
        structuredOutcome: effect === "read" && classifiedOutcome === "unknown"
          ? "success"
          : classifiedOutcome,
        summary: output,
        recordedAt: this.now(),
      });
    } finally {
      if (settleLifecycle) await this.lifecycle.settleTool(binding.planId);
    }
  }

  async recordAgentEvidence(
    _binding: PlanExecutionBinding,
    _evidence: PlanEvidence,
  ): Promise<void> {
    // Agent activity remains in Process/Session trace. PlanStore only owns
    // evidence that can reproduce a declared verification result.
  }

  releaseTool(binding: PlanExecutionBinding): Promise<void> {
    return this.lifecycle.settleTool(binding.planId);
  }

  async notifyTerminal(plan: Readonly<PlanRecord>): Promise<void> {
    await this.lifecycle.notifyTerminal(plan);
  }

  async reportMaterialConflict(
    command: PlanMaterialConflictCommand,
  ): Promise<PlanExecutionMutationResult> {
    return this.lifecycle.reportConflict(command);
  }

  requestReplan(
    command: PlanRequestedReplanCommand,
  ): Promise<PlanExecutionMutationResult> {
    return this.lifecycle.requestReplan(command);
  }

  async cancel(command: PlanCancelCommand): Promise<PlanExecutionMutationResult> {
    return this.lifecycle.cancel(command);
  }

  private async ensureSubagentBinding(
    plan: Readonly<PlanRecord>,
    binding: PlanExecutionBinding,
  ): Promise<Readonly<PlanRecord>> {
    const item = planExecutionUnits(plan).find((candidate) =>
      candidate.stepId === binding.itemId
    );
    if (item && itemBindings(item).some((candidate) =>
      candidate.agentId === binding.agentId
    )) return plan;
    const result = await this.store.update(plan.planId, plan.version, (draft) => {
      requireCurrentApproval(draft, binding.revision, binding.digest);
      const target = requireStepState(draft, binding.itemId);
      if (target.status !== "in_progress") {
        throw new PlanDomainError(
          "invalid_transition",
          "Plan execution step is not active",
        );
      }
      target.executionBindings = [...itemBindings(target), binding];
      target.executionBinding = undefined;
    });
    return result.ok ? result.plan : result.conflict.current;
  }

  private async appendEvidence(
    binding: PlanExecutionBinding,
    evidence: PlanEvidence,
  ): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const plan = await this.requirePlan(binding.planId);
      if (
        !plan
        || ["completed", "cancelled", "failed"].includes(plan.status)
        || plan.revision !== binding.revision
        || plan.digest !== binding.digest
      ) return;
      const current = planExecutionUnits(plan).find((candidate) =>
        candidate.stepId === binding.itemId
      );
      if (!current) return;
      const acceptedEvidence = evidence.kind === "tool_result"
        ? { ...evidence, acceptanceEligible: plan.status === "executing" }
        : evidence;
      const retained = retainVerificationEvidence(
        current,
        current,
        acceptedEvidence,
      );
      if (JSON.stringify(retained) === JSON.stringify(current.evidence)) return;
      const result = await this.store.update(plan.planId, plan.version, (draft) => {
        const step = requireStep(draft, binding.itemId);
        const state = requireStepState(draft, binding.itemId);
        state.evidence = retainVerificationEvidence(
          step,
          state,
          evidence.kind === "tool_result"
            ? { ...evidence, acceptanceEligible: draft.status === "executing" }
            : evidence,
        );
        if (
          binding.role === "main"
          && state.status === "in_progress"
          && allPersistedVerificationsPassed(step, state, draft)
        ) {
          state.status = "completed";
          if (draft.execution.steps.every((candidate) =>
            candidate.status === "completed" || candidate.status === "skipped"
          )) {
            draft.status = "completed";
          }
        }
      });
      if (result.ok) {
        if (result.plan.status === "completed") {
          await this.lifecycle.notifyTerminal(result.plan);
        }
        return;
      }
    }
    throw new Error(`Failed to append Plan evidence for ${binding.planId}`);
  }

  private async requirePlan(planId: string): Promise<Readonly<PlanRecord> | undefined> {
    const loaded = await this.store.load(planId);
    return loaded.ok ? loaded.plan : undefined;
  }
}
