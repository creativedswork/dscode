## 1. Data Structures — Types and Schemas

- [x] 1.1 Create `src/eval/schemas.ts` with all CHIFF TypeScript types: HistoryStep, Subtask, Oracle, LoopInfo, SubtaskEdge, DataTransferItem, FailureMode, AgentNode, OTAR, AgentEdge, AgentDepType, StepDataFlow, CandidateStep, CandidateSet, Attribution, CausalGraphSnapshot
- [x] 1.2 Define runtime validators for LLM output validation on each step (Subtask[] validator for Step 1, SubtaskEdge[] for Step 2, etc.)
- [x] 1.3 Update `src/eval/types.ts` to add new EvalResult fields (causalGraph, attribution, rulesApplied) while keeping backward-compatible fields for rule-engine fallback
- [x] 1.4 Add HistoryStep parser function `parseSessionToSteps(data: SerializedSession): HistoryStep[]` in schemas.ts — extracts agent, observation, thought, action, result from dscode message format

## 2. Causal Graph Store — Deterministic Graph Operations

- [x] 2.1 Create `src/eval/graph-store.ts` with `CausalGraphStore` class: internal maps for subtasks, agentNodes, subtaskEdges, agentEdges, stepFlows
- [x] 2.2 Implement write methods: addSubtasks, addSubtaskEdges, addAgentNodes, addAgentEdges, addStepDataFlows — each validates referential integrity
- [x] 2.3 Implement `validateCoverage(): string[]` — checks subtask step ranges cover 0..N-1 without gaps/overlaps
- [x] 2.4 Implement `isGraphComplete(): boolean` — verifies coverage + every subtask has agent nodes + every adjacent pair has edge
- [x] 2.5 Implement query methods: getTopoOrder, getPredecessors, getLoopGroups, getDataflowPath, getSubtaskOfStep
- [x] 2.6 Implement `snapshot(): CausalGraphSnapshot` for LLM prompt injection in Steps 5-6
- [x] 2.7 Write unit tests for graph-store: coverage validation, predecessor queries, loop group identification, snapshot format

## 3. LLM Prompts — Step-by-Step Prompt Templates

- [x] 3.1 Create `src/eval/prompts.ts` with system prompt constant (role: session quality auditor using CHIFF methodology)
- [x] 3.2 Implement `buildStep1Prompt(question, historySummary): string` — subtask decomposition with oracle structure
- [x] 3.3 Implement `buildStep2Prompt(subtasks, historySummary): string` — subtask edges with data transfer and failure modes
- [x] 3.4 Implement `buildStep3Prompt(subtasks, historySummary): string` — agent OTAR nodes and step data flows
- [x] 3.5 Implement `buildStep4Prompt(subtasks, agentNodes): string` — agent-to-agent edges and failure modes
- [x] 3.6 Implement `buildStep5Prompt(question, historySummary, graphSnapshot): string` — candidate error set with Rule1/2/3 guidance
- [x] 3.7 Implement `buildStep6Prompt(candidateSet, graphSnapshot): string` — single root cause attribution with Rule1/2/3 instructions
- [x] 3.8 Implement `extractJSON(text: string): string | null` — extracts JSON block from LLM response (handles markdown fences, stray text)
- [x] 3.9 Implement `validateAndRetry(llmOutput, schema, retryCount): ParsedResult` — validates against Zod schema, retries with correction hint on failure

## 4. LLM Pipeline — Multi-Step Analysis Engine

- [x] 4.1 Rewrite `src/eval/llm.ts` — replace one-shot `analyzeWithLLM()` with 6-step pipeline executor
- [x] 4.2 Implement `runCausalGraphPipeline(data: SerializedSession, harness: HarnessAPI): Promise<EvalResult>` — orchestrates Steps 0-6
- [x] 4.3 Implement Step 0 executor: parse session to HistoryStep[], compute metadata and tool stats (reuse existing logic from analyzer.ts)
- [x] 4.4 Implement Step 1-4 executors: each calls LLM via `completeSimple()`, parses output, adds to CausalGraphStore
- [x] 4.5 Implement Step 5-6 executors: candidate set generation and counterfactual attribution
- [x] 4.6 Implement graph completeness gate between Step 4 and Step 5 — if isGraphComplete() is false, fall back to rule engine
- [x] 4.7 Implement per-step retry logic: JSON parse failure → retry once with format hint; second failure → fallback to rule engine
- [x] 4.8 Implement progress reporting: each step sends "Step X/6: <description>..." to ui.addInfo()
- [x] 4.9 Implement `mergePipelineResults(ruleResult, pipelineResult): EvalResult` — combines Step 0 stats with causal graph results

## 5. Analyzer Refactoring — Rule Engine as Fallback

- [x] 5.1 Refactor `src/eval/analyzer.ts` — extract `compactSession()` and `analyzeSession()` as standalone fallback functions
- [x] 5.2 Ensure rule-engine `analyzeSession()` returns complete EvalResult with analysisMode: "rule", causalGraph: null, attribution: null
- [x] 5.3 Keep existing Chinese keyword extraction, Jaccard distance, phase detection, root cause inference logic unchanged
- [x] 5.4 Add `analyzeWithRuleEngine(data: SerializedSession): EvalResult` as the unified fallback entry point

## 6. Dashboard Upgrade — Causal Graph Visualization

- [x] 6.1 Update `src/eval/dashboard.ts` — add `generateCausalGraphSVG(snapshot: CausalGraphSnapshot): string` for SVG diagram generation
- [x] 6.2 Implement SVG layout: subtask nodes as rounded rectangles, subtask edges as arrows, agent nodes nested within subtasks
- [x] 6.3 Add `generateDataFlowTable(snapshot: CausalGraphSnapshot): string` — HTML table of data items and their complete flow paths
- [x] 6.4 Add `generateRuleChainHTML(attribution: Attribution, candidateSet: CandidateSet): string` — collapsible Rule1/2/3 reasoning chain
- [x] 6.5 Update `generateDashboardHTML()` to conditionally render causal graph sections (when analysisMode is "llm") or omit them (rule mode)
- [x] 6.6 Update phase timeline generation to use subtask-derived phases (from causalGraph) when available, fall back to regex phases
- [x] 6.7 Ensure all new HTML sections use consistent dark theme colors and escapeHtml for all user content

## 7. Integration — /eval Command and Entry Point

- [x] 7.1 Update `src/eval/index.ts` — replace `analyzeWithLLM()` call with `runCausalGraphPipeline()`, keep `analyzeWithRuleEngine()` as fallback
- [x] 7.2 Update `runEval()` to handle EvalResult with new fields (causalGraph, attribution, rulesApplied)
- [x] 7.3 Update `src/ui/commands.ts` — update eval command description to reference "causal graph analysis"
- [x] 7.4 Ensure `/eval` with no arguments, with full ID, and with prefix works as before
- [x] 7.5 Ensure error messages for "session not found" and "no current session" remain unchanged

## 8. Testing and Validation

- [x] 8.1 Unit test: `parseSessionToSteps()` correctly extracts OTAR from a sample dscode session JSON (use the real session `00MQ65456T8A429KH534XTYPZC`)
- [x] 8.2 Unit test: `CausalGraphStore.validateCoverage()` detects gaps, overlaps, and incomplete coverage
- [x] 8.3 Unit test: `CausalGraphStore.getPredecessors()` returns correct data flow predecessors
- [x] 8.4 Unit test: `extractJSON()` handles markdown fences, stray text, and pure JSON
- [x] 8.5 Integration test: run `/eval` on a real session and verify 6-step pipeline completes without crash
- [x] 8.6 Integration test: run `/eval` with simulated LLM failure and verify rule-engine fallback activates
- [x] 8.7 Manual smoke test: dashboard HTML opens correctly, causal graph SVG renders, Rule chain is readable
- [x] 8.8 Manual smoke test: verify analysis time is acceptable (target: <60s for a 100-message session)
