import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { HarnessEvent } from "../../../src/application/events.js";
import {
  PlanService,
  PlanStore,
  PlanValidationError,
} from "../../../src/application/plan/index.js";
import { projectPublicPlan } from "../../../src/ui/shared/plan-projection.js";
import { makePlanInput } from "./helpers.js";
import {
  makePlan,
  setupPlanBackend,
} from "../../ui/plan-protocol-fixture.js";

const roots: string[] = [];
const FORBIDDEN_PRIVATE_KEYS = new Set([
  "chainOfThought",
  "hiddenPrompt",
  "messages",
  "privateReasoning",
  "rawReasoning",
  "systemPrompt",
  "transcript",
]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function privateKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(privateKeys);
  return Object.entries(value).flatMap(([key, child]) => [
    ...(FORBIDDEN_PRIVATE_KEYS.has(key) ? [key] : []),
    ...privateKeys(child),
  ]);
}

describe("Plan serialization boundaries", () => {
  it("keeps private reasoning fields out of store, events, WebSocket, and UI", async () => {
    const root = await mkdtemp(join(tmpdir(), "dscode-plan-boundary-"));
    roots.push(root);
    const store = new PlanStore({ dataDir: root, projectPath: "/project" });
    const unsafe = makePlanInput("unsafe-plan") as ReturnType<typeof makePlanInput>
      & { hiddenPrompt: string };
    unsafe.hiddenPrompt = "PRIVATE_PROMPT_SENTINEL";

    await expect(store.create(unsafe)).rejects.toBeInstanceOf(
      PlanValidationError,
    );

    const events: HarnessEvent[] = [];
    const service = new PlanService(store, {
      publish: (event) => events.push(event),
      interactionPort: () => ({
        requestPlanDecision: async () => {},
        requestPlanApproval: async () => {},
      }),
    });
    const created = await service.create(makePlanInput("public-plan"));
    if (!created.ok) throw new Error("Plan creation failed");
    expect(privateKeys(created.plan)).toEqual([]);
    expect(privateKeys(events)).toEqual([]);

    const web = setupPlanBackend(created.plan as ReturnType<typeof makePlan>);
    web.events.emit({
      type: "plan:updated",
      planId: created.plan.planId,
      version: created.plan.version,
      revision: created.plan.revision,
      plan: created.plan,
    });
    const wireEvents = web.broadcast.mock.calls.map(([event]) => event);
    expect(privateKeys(wireEvents)).toEqual([]);

    const authorized = makePlan({
      status: "approved",
      approval: {
        revision: 2,
        digest: "a".repeat(64),
        approvedEffects: [],
        acknowledgedSideEffects: [],
        interactionId: "internal:planner-1",
        approvedAt: 10,
      },
    });
    authorized.decisions[0]!.candidates.push({
      optionId: "private-alternative",
      summary: "PRIVATE_REASONING_SENTINEL",
      affectedScopes: ["private"],
      evidence: [],
      risks: ["PRIVATE_PROMPT_SENTINEL"],
      cost: "high",
      reversibility: "partial",
      constraintFit: "satisfies",
      recommended: false,
      rationale: "PRIVATE_CHAIN_OF_THOUGHT_SENTINEL",
    });
    const projection = projectPublicPlan(authorized);
    expect(privateKeys(projection)).toEqual([]);
    expect(JSON.stringify(projection)).not.toMatch(
      /PRIVATE_(?:PROMPT|REASONING|CHAIN_OF_THOUGHT)_SENTINEL/,
    );
  });
});
