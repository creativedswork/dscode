import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PlanExecutionService,
  PlanStore,
} from "../../../src/application/plan/index.js";
import type {
  PlanAcceptanceCriterion,
  PlanEffectGrant,
  PlanItemDraft,
} from "../../../src/application/plan/index.js";
import { makePlanInput } from "./helpers.js";

export async function createExecutionFixture(options: {
  acceptanceCriteria?: PlanAcceptanceCriterion[];
  effectGrants?: PlanEffectGrant[];
  items?: PlanItemDraft[];
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "dscode-plan-execution-"));
  const store = new PlanStore({ dataDir: root, projectPath: root });
  const execution = new PlanExecutionService(store, () => 100);
  const input = makePlanInput();
  input.items = [];
  input.sideEffectSummary = "";
  const created = await store.create(input);
  if (!created.ok) throw new Error("Plan create failed");
  const compiled = await execution.compile(
    input.planId,
    "planner-1",
    created.plan.version,
    {
      items: options.items ?? [{
        itemId: "item-1",
        title: "Implement",
        description: "Apply the approved implementation",
        dependsOn: [],
        acceptanceCriteria: options.acceptanceCriteria ?? [{
          kind: "command",
          criterionId: "tests",
          command: "npm test",
          expectedExitCode: 0,
          expectedOutput: "passed",
        }],
        effectGrants: options.effectGrants ?? [{
          effect: "workspace_write",
          resourceScopes: [{
            kind: "workspace_path",
            pattern: "src/application/plan/**",
          }],
        }],
      }],
      sideEffectSummary: "Writes approved Plan files",
    },
  );
  if (!compiled.ok) throw new Error("Plan compile failed");
  const waiting = await store.persistInteraction(
    input.planId,
    compiled.plan.version,
    {
      interactionId: "approval-1",
      kind: "approval",
      createdAt: 50,
      payload: {
        itemIds: ["item-1"],
        effectCategories: [...new Set(
          compiled.plan.items.flatMap((item) =>
            item.effectGrants.map((grant) => grant.effect)
          ),
        )],
        sideEffectSummary: "Writes approved Plan files",
      },
    },
    (draft) => { draft.status = "awaiting_approval"; },
  );
  if (!waiting.ok || !waiting.plan.pendingInteraction) {
    throw new Error("Approval interaction failed");
  }
  return {
    root,
    store,
    execution,
    awaiting: waiting.plan,
    async approve() {
      const result = await execution.approve({
        planId: input.planId,
        expectedVersion: waiting.plan.version,
        commandId: "approve-1",
        interactionId: "approval-1",
        interactionPayloadDigest: waiting.plan.pendingInteraction!.payloadDigest,
        revision: waiting.plan.revision,
        digest: waiting.plan.digest,
        acknowledgedEffects: [...new Set(
          waiting.plan.items.flatMap((item) =>
            item.effectGrants.map((grant) => grant.effect)
          ),
        )],
      });
      if (!result.ok) throw new Error(`Approval failed: ${result.message}`);
      return result.plan;
    },
  };
}

export async function bindMain(
  fixture: Awaited<ReturnType<typeof createExecutionFixture>>,
  version: number,
) {
  const plan = await fixture.execution.load("plan-1");
  if (!plan.ok || !plan.plan) throw new Error("Plan missing");
  const result = await fixture.execution.bindItem({
    planId: "plan-1",
    expectedVersion: version,
    revision: plan.plan.revision,
    digest: plan.plan.digest,
    itemId: "item-1",
    agentId: "main-1",
    role: "main",
  });
  if (!result.ok) throw new Error(`Bind failed: ${result.message}`);
  const binding = result.plan.items[0].executionBindings?.[0];
  if (!binding) throw new Error("Binding missing");
  return { binding, plan: result.plan };
}
