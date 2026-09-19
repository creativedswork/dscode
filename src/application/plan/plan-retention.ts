import { DEFAULT_TERMINAL_PLAN_RECOVERY_TTL_MS } from "../../config/types.js";
import { PlanStore } from "./store.js";

export class PlanRetentionService {
  constructor(
    private readonly store: PlanStore,
    private readonly terminalRecoveryTtlMs =
      DEFAULT_TERMINAL_PLAN_RECOVERY_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    if (
      !Number.isFinite(terminalRecoveryTtlMs)
      || terminalRecoveryTtlMs < 0
    ) {
      throw new Error("Terminal Plan recovery TTL must be a non-negative number");
    }
  }

  async pruneExpiredTerminalPlans(): Promise<readonly string[]> {
    const expiresAt = this.now() - this.terminalRecoveryTtlMs;
    const plans = await this.store.list();
    const removed = await Promise.all(plans.map(async (plan) => {
      if (!["completed", "cancelled", "failed"].includes(plan.status)) {
        return undefined;
      }
      return await this.store.deleteExpiredTerminal(
          plan.planId,
          plan.version,
          expiresAt,
        )
        ? plan.planId
        : undefined;
    }));
    return removed.filter((planId): planId is string => planId !== undefined);
  }
}
