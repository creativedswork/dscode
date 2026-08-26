import type {
  PlanCancelCommand,
  PlanExecutionMutationResult,
  PlanMaterialConflictCommand,
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
import {
  itemBindings,
  PlanDomainError,
  requireCurrentApproval,
  requireItem,
} from "./execution-rules.js";
import { resourceScopeCovers } from "./resource-scope.js";
import { PlanStore } from "./store.js";
import type {
  PlanEvidence,
  PlanExecutionBinding,
  PlanRecord,
} from "./types.js";

export class PlanExecutionRuntime {
  private readonly lifecycle: PlanExecutionLifecycle;

  constructor(
    private readonly store: PlanStore,
    conflict: (
      command: PlanMaterialConflictCommand,
    ) => Promise<PlanExecutionMutationResult>,
    callbacks: PlanExecutionLifecycleCallbacks,
    private readonly now: () => number = Date.now,
  ) {
    this.lifecycle = new PlanExecutionLifecycle(store, conflict, callbacks, now);
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
    const item = plan.items.find((candidate) =>
      candidate.itemId === authorization.binding.itemId
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
    const grants = item.effectGrants.filter((grant) =>
      grant.effect === authorization.effect
    );
    if (grants.length === 0) {
      const conflict = await this.reportMaterialConflict({
        planId: plan.planId,
        expectedVersion: plan.version,
        commandId: `material-conflict-${authorization.toolCallId}`,
        summary: "Unapproved effect category",
      });
      if (!conflict.ok) {
        return { ok: false, reason: "conflict", message: conflict.message, plan: conflict.plan };
      }
      return { ok: false, reason: "effect_mismatch", message: "Effect is outside Plan approval" };
    }
    const covered = authorization.resourceScopes.length > 0
      && authorization.resourceScopes.every((actual) =>
        grants.some((grant) => grant.resourceScopes.some((scope) =>
          resourceScopeCovers(scope, actual)
        ))
      );
    if (!covered) {
      const conflict = await this.reportMaterialConflict({
        planId: plan.planId,
        expectedVersion: plan.version,
        commandId: `material-conflict-${authorization.toolCallId}`,
        summary: "Unapproved resource scope",
      });
      if (!conflict.ok) {
        return { ok: false, reason: "conflict", message: conflict.message, plan: conflict.plan };
      }
      return { ok: false, reason: "scope_mismatch", message: "Resource is outside Plan approval" };
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
  ): Promise<void> {
    try {
      const details = result && typeof result === "object"
        ? (result as { details?: { exitCode?: unknown } }).details
        : undefined;
      const exitCode = typeof details?.exitCode === "number" ? details.exitCode : undefined;
      const output = summarizeToolResult(result);
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
        structuredOutcome: classifyToolOutcome(result, isError, exitCode),
        summary: output,
        recordedAt: this.now(),
      });
    } finally {
      await this.lifecycle.settleTool(binding.planId);
    }
  }

  async recordAgentEvidence(
    binding: PlanExecutionBinding,
    evidence: PlanEvidence,
  ): Promise<void> {
    if (binding.role === "subagent") {
      const plan = await this.requirePlan(binding.planId);
      if (plan) await this.ensureSubagentBinding(plan, binding);
    }
    await this.appendEvidence(binding, evidence);
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

  async cancel(command: PlanCancelCommand): Promise<PlanExecutionMutationResult> {
    return this.lifecycle.cancel(command);
  }

  private async ensureSubagentBinding(
    plan: Readonly<PlanRecord>,
    binding: PlanExecutionBinding,
  ): Promise<Readonly<PlanRecord>> {
    const item = plan.items.find((candidate) => candidate.itemId === binding.itemId);
    if (item && itemBindings(item).some((candidate) =>
      candidate.agentId === binding.agentId
    )) return plan;
    const result = await this.store.update(plan.planId, plan.version, (draft) => {
      requireCurrentApproval(draft, binding.revision, binding.digest);
      const target = requireItem(draft, binding.itemId);
      if (target.status !== "in_progress") {
        throw new PlanDomainError("invalid_transition", "Plan item is not active");
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
      const result = await this.store.update(plan.planId, plan.version, (draft) => {
        const item = requireItem(draft, binding.itemId);
        if (item.evidence.some((candidate) =>
          candidate.evidenceId === evidence.evidenceId
        )) return;
        const acceptanceEligible = draft.status === "executing";
        item.evidence.push(
          evidence.kind === "tool_result" || evidence.kind === "agent_exit"
            ? { ...evidence, acceptanceEligible }
            : evidence,
        );
        if (evidence.kind === "agent_exit" && evidence.outcome !== "completed") {
          item.status = "blocked";
        }
      });
      if (result.ok) return;
    }
    throw new Error(`Failed to append Plan evidence for ${binding.planId}`);
  }

  private async requirePlan(planId: string): Promise<Readonly<PlanRecord> | undefined> {
    const loaded = await this.store.load(planId);
    return loaded.ok ? loaded.plan : undefined;
  }
}
