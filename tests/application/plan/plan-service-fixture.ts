import {
  PlanService,
  type PlanStore,
} from "../../../src/application/plan/index.js";
import type { HarnessEvent } from "../../../src/application/events.js";

export function createTestPlanService(
  store: PlanStore,
  options: {
    publish?(event: HarnessEvent): void;
    requestPlanDecision?: () => Promise<void>;
    requestPlanApproval?: () => Promise<void>;
    now?: () => number;
  } = {},
): PlanService {
  const interactionPort = {
    requestPlanDecision: options.requestPlanDecision ?? (async () => {}),
    requestPlanApproval: options.requestPlanApproval ?? (async () => {}),
  };
  return new PlanService(store, {
    publish: options.publish ?? (() => {}),
    interactionPort: () => interactionPort,
    now: options.now,
  });
}
