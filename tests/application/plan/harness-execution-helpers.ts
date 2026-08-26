import { join } from "node:path";

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
} from "@earendil-works/pi-ai";

import {
  attachPlanToAgent,
  PlanExecutionService,
  PlanStore,
} from "../../../src/application/plan/index.js";
import type { RoutedHarnessFixture } from "../../helpers/routed-harness.js";
import { makePlanInput } from "./helpers.js";

export function assistant(
  content: AssistantMessage["content"],
  reason: "toolUse" | "stop",
) {
  const message: AssistantMessage = {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: reason,
    timestamp: Date.now(),
  };
  const stream = createAssistantMessageEventStream();
  stream.push({ type: "done", reason, message });
  return stream;
}

export async function installApprovedPlan(fixture: RoutedHarnessFixture) {
  const main = fixture.harness.agentSupervisor.list().find((item) =>
    item.role === "main"
  );
  if (!main) throw new Error("Main process missing");
  const store = new PlanStore({
    dataDir: join(fixture.root, "data"),
    projectPath: fixture.root,
  });
  const service = new PlanExecutionService(store, () => 100);
  const input = makePlanInput();
  input.mainAgentId = main.agentId;
  input.items = [];
  input.sideEffectSummary = "";
  const created = await store.create(input);
  if (!created.ok) throw new Error("Plan create failed");
  const compiled = await service.compile("plan-1", "planner-1", 1, {
    items: [{
      itemId: "item-1",
      title: "Write result",
      description: "Write the approved result file",
      dependsOn: [],
      acceptanceCriteria: [{
        kind: "observable",
        criterionId: "file-created",
        description: "The result file exists",
      }],
      effectGrants: [{
        effect: "workspace_write",
        resourceScopes: [{ kind: "workspace_path", pattern: "result.txt" }],
      }],
    }],
    sideEffectSummary: "Writes result.txt",
  });
  if (!compiled.ok) throw new Error("Compile failed");
  const waiting = await store.persistInteraction("plan-1", compiled.plan.version, {
    interactionId: "approval-1",
    kind: "approval",
    createdAt: 50,
    payload: {
      itemIds: ["item-1"],
      effectCategories: ["workspace_write"],
      sideEffectSummary: "Writes result.txt",
    },
  }, (draft) => { draft.status = "awaiting_approval"; });
  if (!waiting.ok || !waiting.plan.pendingInteraction) {
    throw new Error("Approval interaction failed");
  }
  const approved = await service.approve({
    planId: "plan-1",
    expectedVersion: waiting.plan.version,
    commandId: "approve-1",
    interactionId: "approval-1",
    interactionPayloadDigest: waiting.plan.pendingInteraction.payloadDigest,
    revision: waiting.plan.revision,
    digest: waiting.plan.digest,
    acknowledgedEffects: ["workspace_write"],
  });
  if (!approved.ok) throw new Error("Approval failed");
  attachPlanToAgent(main, approved.plan);
  return { approved: approved.plan, store };
}
