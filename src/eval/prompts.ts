// ── CHIFF Analysis Prompts ──
// Prompt templates for each step of the CHIFF 6-step causal graph pipeline.
// Each function builds a prompt string that instructs the LLM to output structured JSON.

import type { Subtask, AgentNode, CandidateSet, CausalGraphSnapshot } from "./schemas.js";

// ── System Prompt ──

export const CHIFF_SYSTEM_PROMPT = `You are a session quality auditor for dscode — a digital studio for content-driven creation. dscode is not a generic coding bot. It functions as a creative studio that writes, designs, builds, and edits: code, visual concepts, branding, interactive experiences, interfaces, and narrative content. Its sessions span coding, design, storytelling, and editorial work.

Your role: Analyze a dscode session log to construct a causal graph and identify the ROOT CAUSE of any failure or quality degradation. Failures in dscode sessions are not limited to code bugs — they include:
- Creative direction drift (output diverges from the intended aesthetic, brand, or tone)
- Taste degradation (generic, templated, or "AI-slop" output instead of distinctive, intentional work)
- Design-code mismatch (visual output doesn't match the creative intent)
- Scope creep / complexity addiction (adding unnecessary mechanisms that degrade the result)
- Perception blindness (screenshots show problems, but the agent doesn't notice)
- Repair cascade (fixing one issue creates another, especially in visual/creative pipelines)
- Content flatness (output is functional but lacks expression, polish, or editorial sharpness)

You work in a pipeline of 6 deterministic steps. At each step, you will receive specific input and must produce a specific structured JSON output. Do NOT skip steps, do NOT combine steps, and do NOT add commentary outside the JSON.

Output rules:
- ALWAYS output pure JSON. No markdown code fences, no surrounding text.
- Follow the exact field names and types specified.
- If you are unsure about something, provide your best estimate with confidence=0.5.`;

// ── History Summary Builder ──

export function buildHistorySummary(steps: Array<{ stepId: number; agent: string; action: string; thought: string; isError: boolean }>): string {
  const lines: string[] = [];
  lines.push("STEP-BY-STEP HISTORY:");
  lines.push("═".repeat(60));
  for (const s of steps) {
    const err = s.isError ? " ❌ ERROR" : "";
    lines.push(`Step ${s.stepId} [${s.agent}]${err}`);
    lines.push(`  Action: ${s.action.slice(0, 120)}`);
    if (s.thought) lines.push(`  Thought: ${s.thought.slice(0, 100)}`);
    lines.push("");
  }
  return lines.join("\n");
}

// ── Step 1: Subtask Decomposition ──

export function buildStep1Prompt(question: string, historySummary: string, totalSteps: number): string {
  return `STEP 1: SUBTASK DECOMPOSITION

TASK CONTEXT:
Question: ${question}
Total steps: ${totalSteps}

${historySummary}

INSTRUCTIONS:
Decompose this dscode session into a sequence of subtasks. dscode sessions may involve: code architecture and implementation, visual design and branding, content writing and editing, interactive experience prototyping, or combinations of these. Each subtask represents a coherent phase of the creative/technical work. Rules:
1. Subtask step ranges MUST be contiguous, cover ALL steps from 0 to ${totalSteps - 1}, and NOT overlap.
2. Each subtask needs a descriptive name, an Oracle (goal, preconditions, key evidence, acceptance criteria), and loop detection info.
3. If you detect a repair-retry pattern (same tool called repeatedly on same target — e.g., repeated edits to the same file, repeated design tweaks), mark loopInfo accordingly.
4. For creative/design phases, the oracle should assess output QUALITY (distinctiveness, polish, alignment with intent), not just functional correctness.

OUTPUT (pure JSON):
{
  "subtasks": [
    {
      "id": "S1",
      "name": "Initial exploration",
      "stepStart": 0,
      "stepEnd": 5,
      "oracle": {
        "goal": "Understand the project structure and requirements",
        "preconditions": [],
        "keyEvidence": ["Read 3 files to understand codebase"],
        "acceptanceCriteria": ["All relevant files identified"]
      },
      "loopInfo": {
        "isLoopRelated": false,
        "loopRole": "none",
        "loopGroupId": null,
        "reversibility": "reversible",
        "loopRiskScore": 0.0
      }
    }
  ]
}`;
}

// ── Step 2: Subtask Edges ──

export function buildStep2Prompt(subtasks: Subtask[], historySummary: string): string {
  const subtaskList = subtasks
    .map((s) => `- ${s.id}: "${s.name}" (steps ${s.stepStart}-${s.stepEnd}), goal: ${s.oracle.goal}`)
    .join("\n");

  return `STEP 2: SUBTASK EDGES

SUBTASKS FROM STEP 1:
${subtaskList}

${historySummary}

INSTRUCTIONS:
For each ADJACENT pair of subtasks (S1→S2, S2→S3, ...), identify:
1. The dependency type: "data_dependency" (data flows from one to the next) or "logical_prereq" (one must complete before the other starts).
2. Data transfer items: what creative/technical outputs from the upstream subtask are consumed by the downstream subtask. This includes code files, but also: visual assets, design decisions, brand guidelines, content drafts, architectural choices, configuration parameters, or any information produced upstream that constrains downstream work.
3. Failure modes: potential issues at the boundary — loop_issue (repair-retry cycles), data_issue (wrong/misinterpreted/fabricated data crossing phases), irrecoverability_issue (upstream decisions that lock in irreversible downstream consequences), taste_drift (creative direction degrading across phases).

OUTPUT (pure JSON):
{
  "edges": [
    {
      "src": "S1",
      "dst": "S2",
      "type": "data_dependency",
      "strength": 0.8,
      "explanation": "The files read in S1 are modified in S2",
      "dataTransfer": [
        {
          "dataItem": "src/foo.ts",
          "dataType": "text",
          "producerSteps": [3],
          "consumerSteps": [7],
          "usageType": "reference",
          "correctness": "correct"
        }
      ],
      "failureModes": [
        {
          "type": "data_issue",
          "description": "If foo.ts was read incorrectly in S1, S2's modifications will be wrong",
          "severity": 0.7
        }
      ]
    }
  ]
}`;
}

// ── Step 3: Agent Nodes + Step Data Flows ──

export function buildStep3Prompt(subtasks: Subtask[], historySummary: string): string {
  const subtaskList = subtasks
    .map((s) => `- ${s.id}: "${s.name}" (steps ${s.stepStart}-${s.stepEnd})`)
    .join("\n");

  return `STEP 3: AGENT NODES (OTAR) AND STEP DATA FLOWS

SUBTASKS:
${subtaskList}

${historySummary}

INSTRUCTIONS:
For each subtask, extract agent nodes and data flows. dscode's toolset spans both creative and technical domains — tools like write_file, bash, edit for code; but also image generation tools, design tools (brandkit, imagegen-frontend-web, imagegen-frontend-mobile), and skill activation tools. Treat all tools equally as agent actions.
1. Agent nodes: map each tool call to OTAR (Observation, Thought, Action, Result).
1. Agent nodes: map each tool call to OTAR (Observation, Thought, Action, Result).
   - observation = what the agent saw (preceding user message or tool result)
   - thought = the thinking text
   - action = what tool was called with what key arguments
   - result = the tool result text (first 500 chars)
2. Step data flows: track data movement between steps within each subtask.
   - Track code files, visual assets, design parameters, brand decisions, configuration values — any information that flows between steps.
   - For creative tools (image generation, brandkit, design skills), track: generated images, design parameters, palette choices, composition decisions.
   - Mark correctness: "correct", "misinterpreted", "misused", "fabricated", or "taste_degraded" (for creative output that is functional but generic/low-quality).
   - Mark correctness: "correct", "misinterpreted", "misused", or "fabricated"

OUTPUT (pure JSON):
{
  "agents": [
    {
      "subtaskId": "S1",
      "agent": "read_file",
      "otar": {
        "observation": "User asked to modify the reflection system",
        "thought": "Let me first read the current implementation",
        "action": "read_file(path='src/reflections.ts')",
        "result": "export class ReflectionSystem { ... }"
      },
      "stepIds": [0]
    }
  ],
  "dataFlows": [
    {
      "subtaskId": "S1",
      "fromStep": 0,
      "toStep": 3,
      "sourceAgent": "read_file",
      "targetAgent": "write_file",
      "dataItem": "src/reflections.ts",
      "dataType": "text",
      "transformation": "read then modified",
      "correctness": "misinterpreted",
      "confidence": 0.6
    }
  ]
}`;
}

// ── Step 4: Agent Edges ──

export function buildStep4Prompt(subtasks: Subtask[], agentNodes: AgentNode[]): string {
  const bySubtask = new Map<string, AgentNode[]>();
  for (const n of agentNodes) {
    if (!bySubtask.has(n.subtaskId)) bySubtask.set(n.subtaskId, []);
    bySubtask.get(n.subtaskId)!.push(n);
  }

  const sections: string[] = [];
  for (const [sid, nodes] of bySubtask) {
    sections.push(`  ${sid}:`);
    for (const n of nodes) {
      sections.push(`    - ${n.agent}: ${n.otar.action.slice(0, 100)}`);
    }
  }

  return `STEP 4: AGENT EDGES

AGENT NODES BY SUBTASK:
${sections.join("\n")}

INSTRUCTIONS:
Within each subtask, identify dependency edges between agents. Types:
- "obs_dependency": one agent's observation is another's result
- "reasoning_continuation": one agent continues reasoning from another
- "decision_dependency": one agent's action depends on another's decision
- "environment_feedback": response to environment/tool feedback
- "memory_ref": references something stored by prior agent
- "loop_control": part of a repair-retry loop

For each edge, identify potential FAILURE MODES (loop_issue, data_issue, irrecoverability_issue).

OUTPUT (pure JSON):
{
  "edges": [
    {
      "subtaskId": "S1",
      "srcAgent": "read_file",
      "dstAgent": "write_file",
      "depType": "obs_dependency",
      "strength": 0.9,
      "explanation": "write_file acts on the content read by read_file",
      "failureModes": [
        {
          "type": "data_issue",
          "description": "If read_file misreads, write_file writes wrong content",
          "severity": 0.8
        }
      ]
    }
  ]
}`;
}

// ── Step 5: Candidate Error Set ──

export function buildStep5Prompt(
  question: string,
  historySummary: string,
  graphSnapshot: CausalGraphSnapshot,
): string {
  const graphText = JSON.stringify(graphSnapshot, null, 2);

  return `STEP 5: CANDIDATE ERROR SET

TASK: ${question}

CAUSAL GRAPH:
${graphText}

${historySummary}

INSTRUCTIONS:
Using the causal graph above, identify at least 5 candidate error steps. Rules for evaluation:

Rule 1 (Control Flow / Loop): Scan for repair-retry patterns. If the agent repeatedly called the same tool on the same target, check if the loop was justified. If entering the loop was a mistake, flag the entry decision. If the loop was reasonable but an action within it caused irreversible damage, flag that action.

Rule 2 (Data Flow): Trace each key data item from its source. If upstream data was misinterpreted → the current consumer is at fault. If data was fabricated without any upstream source → the fabricator is at fault. If data was correct but misused → the misusing node is at fault.

Rule 3 (Irrecoverable Point): The root cause is the FIRST step that made the correct path unrecoverable — not necessarily the earliest mistake. For dscode, this includes: overwriting files with incorrect content, deleting assets, making irreversible design decisions that cascade, or committing to a wrong creative direction.

Rule 4 (Taste / Creative Drift): Specific to dscode's creative studio nature. The agent was asked for distinctive, intentional, tasteful output but produced something generic, templated, or visually degraded. Look for: design decisions that drifted from the original creative brief, accumulation of effects that made output worse, or settling for "functional but flat" when the task demands expression and polish.

For each candidate, compute:
- impactScore (0-1): how much downstream damage it caused
- confidence (0-1): how certain you are this is a real issue
- irrecoverable: whether this was a point of no return

OUTPUT (pure JSON) — AT LEAST 5 candidates:
{
  "subtasks": ["S2", "S3"],
  "agents": ["write_file", "edit"],
  "steps": [
    {
      "stepId": 12,
      "agentsInStep": ["write_file"],
      "inLoop": false,
      "loopRole": "none",
      "dataIssue": true,
      "dataItem": "src/config.ts",
      "sourceStep": 5,
      "irrecoverable": true,
      "irrecoverableReason": "Overwrote the working config with incorrect values",
      "affectedSteps": [13, 14, 15, 20, 21],
      "impactScore": 0.9,
      "confidence": 0.85
    }
  ]
}

CRITICAL: Output AT LEAST 5 candidate steps. Rank by impactScore descending.`;
}

// ── Step 6: Counterfactual Attribution ──

export function buildStep6Prompt(
  candidateSet: CandidateSet,
  graphSnapshot: CausalGraphSnapshot,
): string {
  const candidatesText = candidateSet.steps
    .map(
      (c, i) =>
        `  ${i + 1}. Step ${c.stepId} [${c.agentsInStep.join(", ")}] impact=${c.impactScore.toFixed(2)} conf=${c.confidence.toFixed(2)}` +
        (c.irrecoverable ? " ⚠ IRRECOVERABLE" : "") +
        (c.dataIssue ? ` data="${c.dataItem}"` : ""),
    )
    .join("\n");

  const graphText = JSON.stringify(graphSnapshot, null, 2);

  return `STEP 6: COUNTERFACTUAL ROOT CAUSE ATTRIBUTION

CANDIDATE ERROR SET (${candidateSet.steps.length} candidates):
${candidatesText}

CAUSAL GRAPH:
${graphText}

INSTRUCTIONS:
Determine the SINGLE root cause from the candidates. Apply the three counterfactual rules:

Rule 1 (Control Flow / Loop): Was there a repair-retry loop? If the loop should not have been entered → root cause is the decision to enter. If the loop was justified but an action caused irreversible damage → root cause is that action.

Rule 2 (Data Flow): Trace the data that led to the failure. Where did incorrect data originate? Was it misinterpreted (fault = consumer), fabricated (fault = fabricator), or misused (fault = misuser)?

Rule 3 (Irrecoverable Point): Root cause = the FIRST step that made the correct path unrecoverable. Not the earliest error, but the first one after which there was no way back. For dscode, this includes design decisions that locked in a wrong creative direction.

Rule 4 (Taste / Creative Drift): Root cause = the step where the agent chose a generic, templated, or visually degraded approach instead of the distinctive, intentional, tasteful output dscode is designed to produce. This applies when the task required creative quality but the agent settled for "just functional."

OUTPUT (pure JSON):
{
  "mistakeAgent": "write_file",
  "mistakeStep": 12,
  "reason": "write_file wrote incorrect configuration values based on a misinterpretation of the upstream read. This was the first irrecoverable action — all subsequent steps operated on wrong config.",
  "rulesApplied": ["Rule2", "Rule3"]
}

CRITICAL: Output exactly ONE root cause. The mistakeAgent MUST be a tool name from the history. The mistakeStep MUST be a step number from the candidate set.`;
}

// ── Step 7 System Prompt ──

export const RULE_ATTRIBUTION_SYSTEM = `You are a dscode Agent configuration auditor. dscode is a digital studio for content-driven creation — its Agent is configured through layered instructions (Identity, Soul, Tool Use Rules, AGENTS.md, Skills).

Your role: Given a complete causal graph analysis of a dscode session (subtasks, data flows, error candidates, root cause attribution), identify WHAT in the Agent's configuration led to the problems observed. Focus on config-level root causes, not session-specific mistakes.

You are NOT reporting what the Agent did wrong in this session. You ARE identifying which part of the Agent's system prompt / tool registry / skills configuration needs improvement.

Output rules:
- ALWAYS output pure JSON array. No markdown, no surrounding text.
- Only output rules with severity >= 0.4. Minor issues should be merged into higher-level rules.
- Be specific about which config layer is implicated. If the problem spans multiple layers, pick the primary one.
- De-concretize: do NOT reference specific file paths, session IDs, or user names in the rule abstract.
- Include session-specific observations in rawDescription for traceability.
- Each rule MUST have a unique, stable id (prefixed with "R_").
- Categories: "identity" (Identity/Soul), "tool_use" (Tool Use Rules), "tool_registry" (Tool Registry), "agents_md" (AGENTS.md), "skill" (Skills), or "other".`;

// ── Step 8 System Prompt ──

export const RULE_MERGE_SYSTEM = `You are a rule taxonomy curator. Your role is to determine whether two Agent configuration rules describe the SAME underlying problem, even if they use different wording.

Rules describe the same problem if:
- They target the same Agent config layer (e.g., both are about Tool Use Rules)
- Their suggested fixes are compatible or identical
- The root cause they identify is semantically equivalent

When in doubt, merge conservatively — it's better to keep rules separate than to incorrectly merge different problems.

Output rules:
- ALWAYS output pure JSON array. No markdown, no surrounding text.
- For each new rule, output one decision object.
- If a new rule matches multiple existing rules, merge into the BEST match (most similar).
- Provide brief reasoning for each decision.`;

// ── Step 7 Prompt Builder ──

export function buildStep7Prompt(
  graphSnapshot: CausalGraphSnapshot | null,
  attribution: { mistakeAgent: string; mistakeStep: number; reason: string; rulesApplied: string[] } | null,
  candidateSetSummary: string,
  sessionFragments: string,
  configExcerpts: string,
  statsSummary: string,
): string {
  const graphText = graphSnapshot ? JSON.stringify(graphSnapshot, null, 2) : "(no causal graph available — rule engine fallback)";
  const attribText = attribution
    ? `Root cause: ${attribution.mistakeAgent} at Step ${attribution.mistakeStep}\nReason: ${attribution.reason}\nRules applied: ${attribution.rulesApplied.join(", ")}`
    : "(no attribution available)";

  return `STEP 7: AGENT CONFIG RULE ATTRIBUTION

CAUSAL GRAPH:
${graphText}

ATTRIBUTION:
${attribText}

CANDIDATE ERRORS:
${candidateSetSummary}

SESSION STATISTICS:
${statsSummary}

SESSION KEY FRAGMENTS (steps around the root cause):
${sessionFragments}

CURRENT AGENT CONFIGURATION (key excerpts):
${configExcerpts}

INSTRUCTIONS:
Analyze the above and identify Agent CONFIGURATION-LEVEL issues — problems with the Agent's system prompt, tool registry, skills, or AGENTS.md that contributed to the session's failures or quality degradation.

For each issue, output a HarnessRule:
- id: stable identifier like "R_WRITE_WITHOUT_READ_VALIDATION"
- category: one of "identity", "tool_use", "tool_registry", "agents_md", "skill", "other"
- targetLayer: specific config section (e.g., "system_prompt.tool_use.rules.4")
- abstract: de-concretized description — what the config problem IS, not what happened in this session
- rawDescription: complete description including session-specific evidence (cite step numbers, agent names)
- severity: 0.0-1.0 (your assessment of how serious this config issue is)
- suggestion: { layer, action ("modify"|"add"|"remove"|"reorder"), current (optional), proposed, rationale }

Output ONLY rules with severity >= 0.4. If no config issue is found, output an empty array [].

OUTPUT (pure JSON array):
[
  {
    "id": "R_EXAMPLE",
    "category": "tool_use",
    "targetLayer": "system_prompt.tool_use.rules.1",
    "abstract": "Agent describes plan before executing, violating 'act first, explain later' rule",
    "rawDescription": "At steps 5, 12, and 18, the agent emitted long explanatory text before calling tools. This delayed execution and consumed context. The current rule phrasing allows preambles.",
    "severity": 0.7,
    "suggestion": {
      "layer": "system_prompt.tool_use.rules.1",
      "action": "modify",
      "current": "When the user asks you to create, modify, or delete files...",
      "proposed": "You MUST call the corresponding tool IMMEDIATELY. Do not describe your plan — the tool call IS the plan. Explain only afterwards, briefly.",
      "rationale": "Current phrasing allows the agent to describe plans as preamble. Tightening to forbid preambles prevents wasted turns."
    }
  }
]`;
}

// ── Step 8 Prompt Builder ──

export function buildStep8Prompt(
  newRules: Array<{ id: string; category: string; abstract: string }>,
  existingRules: Array<{ id: string; category: string; abstract: string; evidenceCount: number }>,
): string {
  const newRulesText = newRules.map((r, i) =>
    `  ${i + 1}. [${r.id}] (${r.category}) ${r.abstract}`
  ).join("\n");

  const existingText = existingRules.length > 0
    ? existingRules.map((r, i) =>
        `  ${i + 1}. [${r.id}] (${r.category}) evidence=${r.evidenceCount} — ${r.abstract.slice(0, 150)}`
      ).join("\n")
    : "  (no existing rules)";

  return `STEP 8: SEMANTIC RULE MERGE

NEW RULES (from this session):
${newRulesText || "  (none)"}

EXISTING RULES (from previous sessions):
${existingText}

INSTRUCTIONS:
For each NEW rule, determine if it describes the same underlying Agent configuration problem as any EXISTING rule. Two rules describe the same problem if they target the same config layer AND identify the same root deficiency, even if worded differently.

For each new rule, output one decision:
- decision: "merge" if it matches an existing rule, "new" if it's a genuinely new problem
- targetRuleId: (only for "merge") the ID of the existing rule to merge into
- reasoning: brief explanation of the match/no-match decision

OUTPUT (pure JSON array):
[
  {
    "newRuleId": "R_WRITE_WITHOUT_READ",
    "decision": "merge",
    "targetRuleId": "R_PREFER_READ_BEFORE_WRITE",
    "reasoning": "Both describe the same pattern: Agent overwrites files without prior validation. Different naming, same config deficiency."
  }
]`;
}


// ── JSON Extraction ──

export function extractJSON(text: string): string | null {
  // Try to find JSON block in markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find the outermost JSON object
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }

  // Try to find JSON array
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return text.slice(firstBracket, lastBracket + 1);
  }

  return null;
}
