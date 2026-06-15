## 1. Foundation: Types & Skeleton

- [x] 1.1 Create `src/eval/focus/types.ts` — define FocusReport, AttentionZone, ZoneAnalysis, ZoneSubtask, ZoneCandidate, FocusAttribution, CascadeEdge, SessionSkeleton, and all supporting types
- [x] 1.2 Create `src/eval/focus/skeleton.ts` — implement `buildSkeleton(steps, ruleResult)` to construct SessionSkeleton from rule engine output: metadata, phase map, signal anchors, hot/cold zone partitioning, data item tracker
- [x] 1.3 Export `focus/types.ts` and `focus/skeleton.ts` from module barrel

## 2. Defense: Budget Guard & Safe Parse

- [x] 2.1 Create `src/eval/focus/budget-guard.ts` — implement `PromptBudgetGuard` with `MAX_PROMPT_CHARS = 60000` and four-tier trimming strategy
- [x] 2.2 Implement `safeJsonParse(json, stepName, validator)` in `src/eval/schemas.ts` — unified try/catch JSON.parse wrapper returning `T | null`
- [x] 2.3 Replace all `JSON.parse(json)` in `src/eval/llm.ts` (6 calls across executeStep1-6) with `safeJsonParse()`
- [x] 2.4 Replace `JSON.parse(json)` in `src/eval/rules/extraction.ts` (line 215) with `safeJsonParse()`
- [x] 2.5 Add `maxTokens` parameter to `callLLM()` in `src/eval/llm.ts` and `extraction.ts` — pass through to `completeSimple()`

## 3. Pass 1: Scan

- [x] 3.1 Create `src/eval/focus/prompts.ts` — define `SCAN_SYSTEM_PROMPT` and `buildScanPrompt(skeleton)` that instructs LLM to identify 3-5 AttentionZones from a SessionSkeleton
- [x] 3.2 Create `src/eval/focus/scan.ts` — implement `scanSession(skeleton, harness)` that calls LLM, parses ScanResult via safeJsonParse, validates zones
- [x] 3.3 Handle `noIssuesDetected: true` — return early from focus pipeline with rule engine result when scan finds nothing

## 4. Pass 2: Zoom

- [x] 4.1 Add `ZOOM_SYSTEM_PROMPT` and `buildZoomPrompt(zone, steps, contextWindow)` to `src/eval/focus/prompts.ts` — instructs LLM to construct complete causal sub-graph within a zone (subtasks, edges, agents, data flows, candidates)
- [x] 4.2 Create `src/eval/focus/zoom.ts` — implement `zoomZone(zone, allSteps, harness)` that calls LLM and validates ZoneAnalysis
- [x] 4.3 Implement recursive splitting: when zone step range >200, build mini-Skeleton from zone steps, call mini-Scan, recursively Zoom sub-zones, merge results
- [x] 4.4 Implement `mergeSubAnalyses(subAnalyses: ZoneAnalysis[]): ZoneAnalysis` — merge recursive sub-zone results into single ZoneAnalysis
- [x] 4.5 Apply Budget Guard to Zoom prompts — enforce 60K char limit before LLM call

## 5. Pass 3: Synthesize

- [x] 5.1 Add `SYNTH_SYSTEM_PROMPT` and `buildSynthesizePrompt(scanResult, zoneAnalyses, skeleton)` to `src/eval/focus/prompts.ts` — includes Rule1/2/3/4 for counterfactual attribution
- [x] 5.2 Create `src/eval/focus/synthesize.ts` — implement `synthesize(scanResult, zoneAnalyses, skeleton, harness)` that calls LLM and validates FocusAttribution
- [x] 5.3 Implement zone sub-graph merging into unified CausalGraphSnapshot with zone provenance (zoneId prefixes on subtask IDs)
- [x] 5.4 Extract HarnessRules from focused context (call existing `attributeWithLLM` with adapted inputs from zone analyses + attribution)

## 6. Pipeline Integration

- [x] 6.1 Create `src/eval/focus/index.ts` — implement `runFocusPipeline(data, harness, ruleResult)` that orchestrates: buildSkeleton → scanSession → zoomZone (foreach) → synthesize → compose EvalResult
- [x] 6.2 Add `FOCUS_PATH_THRESHOLD = 500` constant (hardcoded, V1) and path selection logic to `src/eval/index.ts` — `runEval` calls `runFocusPipeline` when steps ≥500, else `runCausalGraphPipeline`
- [x] 6.3 Add cascadePath visualization to `src/eval/dashboard.ts` — render zone blocks with arrows for cascade edges, root cause badge, Chinese mechanism labels; hidden when cascadePath empty or analysisMode is "rule"
- [x] 6.4 Export `runFocusPipeline` from `src/eval/llm.ts` alongside existing `runCausalGraphPipeline`
- [x] 6.5 Implement `FocusReport → EvalResult` conversion in `focus/index.ts` — map FocusAttribution to existing Attribution type, merge zone subtasks into CausalGraphSnapshot, map candidates to deviations
## 7. Tests & Validation

- [x] 7.1 Unit test `buildSkeleton()` with a mock ruleResult — verify phase map, signal anchors, hot/cold zone partitioning, data item tracker
- [x] 7.2 Unit test `PromptBudgetGuard` — verify four-tier trimming with prompts at various sizes
- [x] 7.3 Unit test `safeJsonParse()` — valid JSON, unterminated string, valid JSON failing validation, empty input
- [x] 7.4 Unit test `mergeSubAnalyses()` — two ZoneAnalyses merge correctly with non-overlapping step ranges
- [x] 7.5 Unit test `FocusReport → EvalResult` conversion — verify all required EvalResult fields are populated
- [ ] 7.6 Integration test: run `runFocusPipeline` on a small mock session (≥500 steps) — verify no crashes, valid EvalResult output
- [x] 7.7 Regression test: verify `runCausalGraphPipeline` is unchanged for sessions <500 steps (existing tests pass)

## 8. Tool Error Granularity (Design Decision 8)

- [x] 8.1 Add `errorType` field to `ZoneCandidate` in `src/eval/focus/types.ts` — `errorType?: "hash_ambiguity" | "network_timeout" | "permission_denied" | "file_not_found" | "syntax_error" | "runtime_exception" | "unknown"`
- [x] 8.2 Update `buildSignalAnchors()` in `skeleton.ts` — tool error labels SHALL include result summary: `"${agent}: ${first 70 chars of result}"` instead of `"${agent} error"`
- [x] 8.3 Update `isToolResultError()` / timeline in `analyzer.ts` — `TimelineEvent.label` SHALL include tool name and error summary, not fixed "Tool error"
- [x] 8.4 Update `ZOOM_SYSTEM_PROMPT` in `focus/prompts.ts` — add instruction to classify candidates with errorType field
- [x] 8.5 Update `SYNTH_SYSTEM_PROMPT` in `focus/prompts.ts` — add instruction to include tool name + error type in reason field
- [x] 8.6 Update `validateZoneAnalysis()` in `focus/zoom.ts` — parse `errorType` from LLM output
- [x] 8.7 Update dashboard `generateDashboardHTML()` — render Timeline section with tool-specific error labels
- [x] 8.8 Unit test: verify signal anchor label format for tool errors
- [x] 8.9 Integration test: verify Zoom prompt includes errorType instruction, Synthesize reason contains tool name + error type

- [x] 8.10 Add `errorLayer` field to `ZoneCandidate` type — `"tool_error" | "agent_error" | "process_error"`
- [x] 8.11 Update `ZOOM_SYSTEM_PROMPT` — add instruction to classify each candidate with errorLayer + errorType per the three-layer framework
- [x] 8.12 Update `SYNTH_SYSTEM_PROMPT` — add instruction to derive cascade mechanism from error types, and include errorLayer+errorType in reason
