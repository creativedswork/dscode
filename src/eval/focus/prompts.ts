// ── Focus Pipeline Prompts ──
// Prompt templates for the three-pass iterative focusing pipeline:
// Pass 1 Scan, Pass 2 Zoom, Pass 3 Synthesize.

import type { SessionSkeleton, AttentionZone, ZoneAnalysis, ScanResult, FocusAttribution } from "./types.js";
import type { HistoryStep } from "../schemas.js";

// ── Pass 1: Scan System Prompt ──

export const SCAN_SYSTEM_PROMPT = `You are a session quality auditor for dscode — a digital studio for content-driven creation. Your role in this step is a SCANNER: quickly scan a dense session skeleton to identify 3-5 "attention zones" where problems are most likely concentrated.

You are NOT doing deep analysis. You are identifying WHERE to look deeper. Think of it like a doctor checking vitals and identifying which organs need imaging.

Output rules:
- ALWAYS output pure JSON. No markdown code fences, no surrounding text.
- Identify 3-5 zones, ordered by suspicionScore descending.
- If the session appears fully healthy, set noIssuesDetected: true.
- Each zone MUST have stepStart/stepEnd (global step IDs from the skeleton).
- suspicionScore: 0.0 (nothing suspicious) to 1.0 (almost certainly problematic).
- primarySignal MUST be one of the listed signal types.
- Be specific about keyAgents (tool names) and keyDataItems (file paths) involved.`;

// ── Pass 1: Build Scan Prompt ──

export function buildScanPrompt(skeleton: SessionSkeleton): string {
  const metaBlock = [
    `SESSION METADATA:`,
    `  Question: ${skeleton.meta.question}`,
    `  Total steps: ${skeleton.meta.totalSteps}`,
    `  Messages: ${skeleton.meta.totalMessages}`,
    `  Error rate: ${skeleton.meta.errorRate}`,
    `  Duration: ${skeleton.meta.duration}`,
    `  Model: ${skeleton.meta.model}`,
  ].join("\n");

  const statsBlock = [
    `STATISTICS:`,
    `  Tool calls: ${skeleton.stats.toolCalls}`,
    `  Tool errors: ${skeleton.stats.toolErrors}`,
    `  User complaints: ${skeleton.stats.userComplaints}`,
    `  Screenshots: ${skeleton.stats.screenshotsTaken}`,
  ].join("\n");

  const phasesBlock = [
    `PHASE MAP (${skeleton.phases.length} phases):`,
    ...skeleton.phases.map((p) =>
      `  ${p.id}: "${p.label}" | ${p.stepRange} | status=${p.status} | ${p.toolSummary}`
    ),
  ].join("\n");

  const signalsBlock = [
    `SIGNAL ANCHORS (${skeleton.signalAnchors.length} total):`,
    ...skeleton.signalAnchors.map((a) =>
      `  Step ${a.stepId} | ${a.type} | priority=${a.priority} | ${a.label.slice(0, 80)}`
    ),
  ].join("\n");

  const hotZonesBlock = [
    `HOT ZONES (${skeleton.hotZones.length}):`,
    ...skeleton.hotZones.map((hz) => {
      const sigSummary = hz.signals.map((s) => `${s.type}@${s.stepId}`).join(", ");
      return [
        `  Zone [${hz.stepStart}-${hz.stepEnd}] suspicion=${hz.suspicionScore.toFixed(2)} primarySignal=${hz.primarySignal}`,
        `    Signals (${hz.signals.length}): ${sigSummary}`,
        `    Steps: ${hz.steps.length} total, ${hz.steps.filter((s) => s.isError).length} errors`,
        `    First 5 agents: ${hz.steps.slice(0, 5).map((s) => `${s.agent}@${s.stepId}`).join(", ")}`,
      ].join("\n");
    }),
  ].join("\n");

  const coldZonesBlock = [
    `COLD ZONES (${skeleton.coldZones.length}):`,
    ...skeleton.coldZones.map((cz) =>
      `  Range ${cz.stepRange} | ${cz.errorCount} errors | ${cz.userMessages} user msgs | tools: ${JSON.stringify(cz.toolCountByAgent)}`
    ),
  ].join("\n");

  const dataItemsBlock = [
    `DATA ITEMS (${skeleton.dataItems.length} tracked, ${skeleton.dataItems.filter((d) => d.isHot).length} hot):`,
    ...skeleton.dataItems
      .filter((d) => d.operationCount >= 5 || d.isHot)
      .slice(0, 15)
      .map((d) =>
        `  ${d.dataItem} | ops=${d.operationCount} | agents=[${d.agents.join(", ")}]${d.isHot ? " 🔥HOT" : ""}`
      ),
  ].join("\n");

  return `PASS 1 — SCAN: ATTENTION ZONE IDENTIFICATION

${metaBlock}

${statsBlock}

${phasesBlock}

${signalsBlock}

${hotZonesBlock}

${coldZonesBlock}

${dataItemsBlock}

INSTRUCTIONS:
You are scanning a dscode session skeleton to identify WHERE problems are concentrated.

1. Review the phase map. Phases with status "danger" or "warn" are prime candidates.
2. Review signal anchors. Dense clusters of high-priority signals indicate trouble spots.
3. Review hot zones. These are pre-computed regions of concentrated signals.
4. Review cold zones briefly — they may hide subtle issues the rule engine missed.
5. Review hot data items — files modified 10+ times often indicate repair loops.

Identify 3-5 attention zones. Each zone is a contiguous step range you want to zoom into.
Zones should ideally be non-overlapping and cover the most suspicious regions.

For each zone, determine:
- stepStart/stepEnd (global step IDs — use the step numbers from the skeleton)
- suspicionScore (0.0-1.0, based on signal density, severity, and pattern)
- primarySignal: one of "user_complaint_cluster", "error_burst", "repair_loop", "screenshot_divergence", "irreversible_action", "taste_drift"
- summary: one sentence describing WHY this zone is suspicious
- keyAgents: list of tool names that dominate this zone
- keyDataItems: list of files/assets that are central to this zone

If the session looks completely healthy (all phases "ok", zero signal anchors, zero errors), set noIssuesDetected: true.

OUTPUT (pure JSON):
{
  "zones": [
    {
      "id": "Z1",
      "stepStart": 300,
      "stepEnd": 360,
      "suspicionScore": 0.85,
      "primarySignal": "repair_loop",
      "summary": "Dense cluster of write_file/edit calls to same file with user complaints",
      "keyAgents": ["write_file", "edit", "read_file"],
      "keyDataItems": ["src/shaders/water.frag"]
    }
  ],
  "globalAssessment": "Session has a severe repair loop in the shader phase with user frustration",
  "noIssuesDetected": false
}`;
}

// ── Pass 2: Zoom System Prompt ──

export const ZOOM_SYSTEM_PROMPT = `You are a causal graph analyst for dscode — a digital studio for content-driven creation. Your role in this step is a DEEP-DIVE ANALYST: given a narrow attention zone (≤200 steps), construct a complete causal sub-graph.

You must identify:
1. Subtasks within the zone (2-4 zone-level subtasks that decompose the work)
2. Dependencies between subtasks (data flow edges, failure modes)
3. Agent nodes with OTAR (Observation, Thought, Action, Result) for key tool calls
4. Agent dependency edges within the zone
5. Step-level data flows tracking code files, visual assets, design decisions
6. Candidate error steps (≥3) ranked by impact, each classified with:
     - errorLayer: "tool_error" (tool itself failed), "agent_error" (agent judgment mistake), or "process_error" (systemic/flow issue)
     - errorType: for tool_error — hash_ambiguity, network_timeout, permission_denied, file_not_found, syntax_error, runtime_error, tool_misuse; for agent_error — misdiagnosis, overcorrection, perception_gap, taste_degraded, scope_creep; for process_error — repair_loop, deadlock, context_overflow
7. Cross-candidate reasoning: identify whether errors are tool-reliability issues (tool_error) or agent decision failures (agent_error)

dscode's toolset spans creative and technical domains. Pay attention to:
- image generation / design tools (brandkit, imagegen-frontend-web, imagegen-frontend-mobile)
- code editing tools (write_file, edit, bash)
- skill activation tools
- screenshot tools and the agent's perception of visual results

Output rules:
- ALWAYS output pure JSON. No markdown, no surrounding text.
- Subtask IDs must be prefixed with the zone ID (e.g., "Z1_S1").
- All step IDs must be global step IDs.
- Candidates must have impactScore and confidence between 0.0-1.0.`;

// ── Pass 2: Build Zoom Prompt ──

export function buildZoomPrompt(
  zone: AttentionZone,
  steps: HistoryStep[],
  contextWindow: number = 10,
): string {
  const zoneSteps = steps.filter(
    (s) => s.stepId >= zone.stepStart - contextWindow && s.stepId <= zone.stepEnd + contextWindow
  );

  const stepsBlock = zoneSteps.map((s) => {
    const err = s.isError ? " ❌" : "";
    const inZone = s.stepId >= zone.stepStart && s.stepId <= zone.stepEnd ? " [IN ZONE]" : " [context]";
    return [
      `Step ${s.stepId} [${s.agent}]${err}${inZone}`,
      `  Action: ${s.action.slice(0, 150)}`,
      s.thought ? `  Thought: ${s.thought.slice(0, 150)}` : "",
      s.result ? `  Result: ${s.result.slice(0, 200)}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return `PASS 2 — ZOOM: CAUSAL SUB-GRAPH CONSTRUCTION

ZONE: ${zone.id}
Step range: ${zone.stepStart}-${zone.stepEnd} (${zone.stepEnd - zone.stepStart + 1} steps)
Suspicion score: ${zone.suspicionScore.toFixed(2)}
Primary signal: ${zone.primarySignal}
Summary: ${zone.summary}
Key agents: ${zone.keyAgents.join(", ")}
Key data items: ${zone.keyDataItems.join(", ")}

DETAILED STEPS (with ±${contextWindow} context window):
${stepsBlock}

INSTRUCTIONS:
You are analyzing this zone to construct a complete causal sub-graph.

1. SUBTASKS (2-4): Decompose the zone's work into coherent sub-phases. Each subtask must:
   - Have an ID prefixed with "${zone.id}_" (e.g., "${zone.id}_S1")
   - Cover a contiguous step range within [${zone.stepStart}, ${zone.stepEnd}]
   - Have an oracle with goal, preconditions, key evidence, and acceptance criteria
   - Include loop detection info

2. SUBTASK EDGES: For adjacent subtask pairs, identify data dependencies and failure modes.
   - Track creative/technical outputs crossing subtask boundaries
   - Mark failure modes as: loop_issue, data_issue, irrecoverability_issue, or taste_drift

3. AGENT NODES: For key tool calls within the zone, extract OTAR:
   - observation: what the agent saw (preceding message or tool result)
   - thought: the agent's reasoning
   - action: the tool call with key arguments
   - result: the tool result (summarized)

4. AGENT EDGES: Identify dependencies between agents within each subtask.
   Types: obs_dependency, reasoning_continuation, decision_dependency, environment_feedback, memory_ref, loop_control

5. STEP DATA FLOWS: Track data movement between steps. Mark correctness:
   - "correct", "misinterpreted", "misused", "fabricated", "taste_degraded"

6. CANDIDATES (≥3): Identify error candidates ranked by impactScore.
   - Each candidate MUST include errorLayer ("tool_error" | "agent_error" | "process_error") and errorType (see system prompt for values)
   - Each candidate references global step IDs
   - Mark irrecoverable steps with irrecoverableReason
   - topCandidate must be set to the highest-impact candidate

OUTPUT (pure JSON):
{
  "zoneId": "${zone.id}",
  "subtasks": [
    {
      "id": "${zone.id}_S1",
      "name": "Attempted fix of water shader",
      "stepStart": ${zone.stepStart},
      "stepEnd": ${Math.min(zone.stepStart + 50, zone.stepEnd)},
      "oracle": {
        "goal": "Fix the visual appearance of water reflections",
        "preconditions": ["Shaders are readable"],
        "keyEvidence": ["Modified water.frag 3 times"],
        "acceptanceCriteria": ["Water looks correct in screenshot"]
      },
      "loopInfo": {
        "isLoopRelated": false,
        "loopRole": "none",
        "loopGroupId": null,
        "reversibility": "reversible",
        "loopRiskScore": 0.0
      }
    }
  ],
  "subtaskEdges": [],
  "agentNodes": [],
  "agentEdges": [],
  "stepDataFlows": [],
  "candidates": [],
  "topCandidate": null,
  "zoneGraphComplete": false
}`;
}

// ── Pass 3: Synthesize System Prompt ──

export const SYNTH_SYSTEM_PROMPT = `You are a root cause analyst for dscode — a digital studio for content-driven creation. Your role is the final SYNTHESIZER: given deep-dive analyses of multiple attention zones, determine the SINGLE root cause and trace how it propagated across zones.

You apply four counterfactual rules:
- Rule 1 (Control Flow / Loop): Was there an unjustified repair-retry loop? If so, was entering the loop the mistake, or was an action within it?
- Rule 2 (Data Flow): Trace incorrect data to its source. Was data misinterpreted, fabricated, or misused?
- Rule 3 (Irrecoverable Point): The FIRST step that made the correct path unrecoverable — not the earliest error.
- Rule 4 (Taste / Creative Drift): For dscode's creative studio nature — did the agent produce generic/templated output instead of distinctive, intentional work?

You must also identify the CASCADE PATH: how the root cause error propagated from its origin zone to other zones.

Output rules:
- ALWAYS output pure JSON. No markdown, no surrounding text.
- mistakeAgent MUST be a tool name.
- mistakeStep MUST be a global step number.
- zoneId MUST match one of the zone IDs provided.
- cascadePath edges must reference real zone IDs and step numbers.
- Provide 0-2 alternateRootCauses when multiple explanations are plausible.

Three-layer error classification MUST be used to derive attribution:
- Layer 1 — errorLayer: Is the root cause tool_error (tool failure), agent_error (judgment mistake), or process_error (systemic issue)?
- Layer 2 — errorType: Specific failure type within that layer (see Zoom prompt for value space)
- Layer 3 — mechanism: Derive cascadePath mechanism from root cause's errorType (hash_ambiguity→data_contamination, overcorrection→repair_cascade, taste_degraded→taste_drift_propagation, etc.)

In the reason field, you MUST include: tool name + errorLayer + errorType + cascade logic. Format: "[agentName] at step N: errorType error (errorLayer). Explanation..."`;

// ── Pass 3: Build Synthesize Prompt ──

export function buildSynthesizePrompt(
  scanResult: ScanResult,
  zoneAnalyses: ZoneAnalysis[],
  skeleton: SessionSkeleton,
): string {
  const zonesBlock = scanResult.zones.map((z) => {
    const analysis = zoneAnalyses.find((a) => a.zoneId === z.id);
    const topCand = analysis?.topCandidate;
    return [
      `Zone ${z.id}: [${z.stepStart}-${z.stepEnd}] suspicion=${z.suspicionScore.toFixed(2)} signal=${z.primarySignal}`,
      `  Summary: ${z.summary}`,
      `  Key agents: ${z.keyAgents.join(", ")}`,
      `  Key data items: ${z.keyDataItems.join(", ")}`,
      topCand ? `  Top candidate: Step ${topCand.stepId} [${topCand.agentsInStep.join(", ")}] impact=${topCand.impactScore.toFixed(2)} ${topCand.irrecoverable ? "⚠ IRRECOVERABLE" : ""}` : "",
      analysis ? `  Subtasks: ${analysis.subtasks.length}, Candidates: ${analysis.candidates.length}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const candidatesBlock = zoneAnalyses.flatMap((a) => a.candidates)
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 10)
    .map((c, i) =>
      `  ${i + 1}. Zone ${zoneAnalyses.find((a) => a.candidates.includes(c))?.zoneId ?? "?"} Step ${c.stepId} [${c.agentsInStep.join(", ")}] impact=${c.impactScore.toFixed(2)} ${c.irrecoverable ? "⚠ IRRECOVERABLE" : ""} ${c.irrecoverableReason}`
    ).join("\n");

  const dataFlowsBlock = zoneAnalyses.flatMap((a) => a.stepDataFlows)
    .filter((f) => f.correctness !== "correct")
    .slice(0, 8)
    .map((f) =>
      `  ${f.dataItem}: ${f.fromStep}→${f.toStep} (${f.correctness}) — ${f.transformation.slice(0, 80)}`
    ).join("\n");

  return `PASS 3 — SYNTHESIZE: CROSS-ZONE ROOT CAUSE ATTRIBUTION

GLOBAL ASSESSMENT: ${scanResult.globalAssessment}

ATTENTION ZONES (${scanResult.zones.length}):
${zonesBlock}

TOP CANDIDATES ACROSS ALL ZONES:
${candidatesBlock || "  (no candidates)"}

ANOMALOUS DATA FLOWS:
${dataFlowsBlock || "  (no anomalies)"}

SESSION CONTEXT:
  Question: ${skeleton.meta.question}
  Total steps: ${skeleton.meta.totalSteps}
  Error rate: ${skeleton.meta.errorRate}
  User complaints: ${skeleton.stats.userComplaints}

INSTRUCTIONS:
You must now determine the SINGLE root cause by applying the four counterfactual rules.

Rule 1 (Control Flow / Loop): Scan for repair-retry patterns. If the agent repeatedly called the same tool on the same target, check if the loop was justified (fixing a real problem) or unjustified (trying things without understanding). The root cause of an unjustified loop is the decision to enter it, OR an action within it that caused irreversible damage.

Rule 2 (Data Flow): Trace incorrect data to its origin. Was data misinterpreted (fault = consumer who misunderstood), fabricated (fault = creator of false data), or misused (fault = consumer who used correct data wrongly)?

Rule 3 (Irrecoverable Point): Root cause = the FIRST step that made the correct path unrecoverable. Not the earliest error, but the first one after which there was no way back. For dscode, this includes: overwriting files, deleting assets, irreversible design decisions, committing to a wrong creative direction.

Rule 4 (Taste / Creative Drift): dscode is a creative studio. If the agent was asked for distinctive, intentional, tasteful output but produced generic/"AI-slop" output, identify the step where creative direction was compromised.

Identify the CASCADE PATH: how the root cause propagated from its origin zone to other zones.
Mechanisms:
- "data_contamination": bad data from one zone corrupted work in another
- "irreversible_lock_in": a decision in one zone locked in a path that forced errors in another
- "perception_blind_spot": the agent failed to notice a problem visible in screenshots
- "repair_cascade": fixing a non-problem created a real problem
- "taste_drift_propagation": creative degradation spread across phases

Provide 0-2 alternateRootCauses when you can identify plausible alternative explanations with lower confidence.

OUTPUT (pure JSON):
{
  "mistakeAgent": "write_file",
  "mistakeStep": 314,
  "zoneId": "Z1",
  "reason": "write_file overwrote the correct water shader with an incorrect version based on a misdiagnosis. This was the irrecoverable point — all subsequent repair attempts were built on the wrong baseline.",
  "rulesApplied": ["Rule2", "Rule3"],
  "cascadePath": [
    {
      "fromZoneId": "Z1",
      "fromStepId": 314,
      "toZoneId": "Z2",
      "toStepId": 480,
      "dataItem": "src/shaders/water.frag",
      "mechanism": "data_contamination"
    }
  ],
  "alternateRootCauses": []
}`;
}
