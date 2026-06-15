## 1. Foundation: Agent Loop Engine

- [x] 1.1 Create `src/eval/focus/agent-loop.ts` — implement `agentLoop()` with `while (!done) { callLLM; executeTools }` loop, tool sandbox (path prefix validation), soft limit enforcement, schema-driven retry, progress callback
- [x] 1.2 Implement tool executors inside agent-loop: `read_file` (scope: library/ + notebook/ + output/), `write_file` (scope: notebook/ + output/), `grep` (scope: library/ + notebook/), `glob` (scope: library/ + notebook/)
- [x] 1.3 Implement JSON extraction and schema validation in agent loop: `extractJSON` → `safeJsonParse` → validator, retry up to 3 times with correction hint
- [x] 1.4 Implement soft limit: warn at `maxToolCalls - 5`, force-output at `maxToolCalls`, give 5 more attempts without tools, terminate with null
- [x] 1.5 Export `agentLoop`, `AgentLoopConfig`, `ProgressEvent` types from module

## 2. Foundation: Workspace Generator

- [x] 2.1 Create `src/eval/focus/workspace.ts` — implement `createWorkspace(sessionId)` that creates `~/.dscode/eval/{sessionId}/library/`, `notebook/`, `output/` directories, and cleans existing workspace if present
- [x] 2.2 Implement `writeLibraryMetadata(skeleton)` → `library/meta.md` with question, totalSteps, errorRate, duration, model
- [x] 2.3 Implement `writeLibrarySkeleton(skeleton)` → `library/skeleton.md` with phase map table, hot/cold zone summary, analysis hints
- [x] 2.4 Implement `writeLibrarySignals(skeleton)` → `library/signals.md` grouped by signal type, sorted by priority
- [x] 2.5 Implement `writeLibraryDataItems(skeleton)` → `library/data-items.md` sorted by operationCount, hot items marked 🔥, full operation chains
- [x] 2.6 Implement `writeLibrarySteps(steps, phases)` → `library/steps/P*-L*-L*.md` with step detail (stepId, agent, action 150c, thought 100c, result 200c, error marker), partitioned by phase with 150-step max per file
- [x] 2.7 Implement `writeLibraryReadme(phase)` → `library/README.md` with navigation guide tailored to current CHIFF phase (SCAN vs ZOOM vs SYNTHESIZE)
- [x] 2.8 Implement `writeLibrary(skeleton, steps, ruleResult, phase)` — orchestrates all library file writes, returns workspace path
- [x] 2.9 Implement `cleanOldWorkspaces(maxRetain=10)` — delete oldest workspaces exceeding retention limit

## 3. Foundation: Progress Display

- [x] 3.1 Create `src/eval/focus/progress.ts` — implement `ProgressDisplay` class with `onPhaseStart`, `onPhaseProgress`, `onPhaseDone` methods
- [x] 3.2 Implement terminal rendering: ANSI-based progress bar, spinner animation, phase log with status icons (✓ / ⠋ / ⏳), tool call counter, latest operation description
- [x] 3.3 Implement phase lifecycle: Phase 0/4 (落盘), Phase 1/4 (SCAN), Phase 2/4 (ZOOM with sub-zone status), Phase 3/4 (SYNTHESIZE), Phase 4/4 (生成报告)
- [x] 3.4 Implement completion summary: total duration, total LLM calls, key findings
- [x] 3.5 Stub for web progress (emit events struct for future WebSocket integration, actual WebSocket push deferred to web integration task)

## 4. Agent System Prompts

- [x] 4.1 Rewrite `src/eval/focus/prompts.ts` — remove `buildScanPrompt`, `buildZoomPrompt`, `buildSynthesizePrompt`; add `SCAN_AGENT_SYSTEM_PROMPT`, `ZOOM_AGENT_SYSTEM_PROMPT`, `SYNTH_AGENT_SYSTEM_PROMPT` as Agent system prompts
- [x] 4.2 Add `buildScanTaskPrompt(skeleton)` → Agent task prompt for Scan phase: instructs to explore library/, identify 3-5 zones, output to `output/scan-result.json`, optionally write notes to `notebook/scan-notes.md`
- [x] 4.3 Add `buildZoomTaskPrompt(zone, skeleton)` → Agent task prompt for Zoom phase: instructs to read notebook/scan-notes.md, deep-dive zone steps from library/steps/, output to `output/zone-{id}-result.json`, optionally write notes to `notebook/zone-{id}-analysis.md`
- [x] 4.4 Add `buildSynthesizeTaskPrompt(zones, skeleton)` → Agent task prompt for Synthesize phase: instructs to read all notebook/zone-*.md, cross-reference candidates, apply Rule1/2/3, output to `output/attribution.json`, optionally write notes to `notebook/synthesis-notes.md`

## 5. Pass Rewrite: SCAN

- [x] 5.1 Rewrite `src/eval/focus/scan.ts` — remove `callLLM` direct completion; replace `scanSession(skeleton, harness)` with Agent-based implementation using `agentLoop()`
- [x] 5.2 Produce SCAN system prompt and task prompt via `prompts.ts`, configure tools: `read_file`, `grep`, `glob`, `write_file`
- [x] 5.3 After Agent completes, read and validate `output/scan-result.json` using existing `validateScanResult`
- [x] 5.4 Handle noIssuesDetected: return early from pipeline when scan finds nothing
- [x] 5.5 Handle Agent failure: return `{ zones: [], noIssuesDetected: true }` on null result

## 6. Pass Rewrite: ZOOM

- [x] 6.1 Rewrite `src/eval/focus/zoom.ts` — remove `callLLM` direct completion; replace `zoomZone(zone, steps, harness)` with Agent-based implementation using `agentLoop()`
- [x] 6.2 Produce ZOOM system prompt and task prompt via `prompts.ts`, configure tools: `read_file`, `grep`, `glob`, `write_file`
- [x] 6.3 After Agent completes, read and validate `output/zone-{id}-result.json` using existing `validateZoneAnalysis`
- [x] 6.4 Retain recursive splitting logic for zones >200 steps, but each sub-zone spawns its own Agent session
- [x] 6.5 Retain `mergeSubAnalyses` for merging recursive sub-zone results
- [x] 6.6 Handle Agent failure: return empty ZoneAnalysis with zoneId on null result

## 7. Pass Rewrite: SYNTHESIZE

- [x] 7.1 Rewrite `src/eval/focus/synthesize.ts` — remove `callLLM` direct completion; replace `synthesize(scanResult, zoneAnalyses, skeleton, harness)` with Agent-based implementation using `agentLoop()`
- [x] 7.2 Produce SYNTHESIZE system prompt and task prompt via `prompts.ts`, configure tools: `read_file`, `grep`, `glob`, `write_file`
- [x] 7.2a Preserve `validateRecoveryArcs()` from `eval-recovery-arc` — recovery arc detection and validation SHALL remain functional in rewritten synthesize module
- [x] 7.3 After Agent completes, read and validate `output/attribution.json` using existing `validateFocusAttribution`
- [x] 7.4 Retain zone sub-graph merging into unified CausalGraphSnapshot (`buildMergedGraphSnapshot`)
- [x] 7.5 Handle Agent failure: return default FocusAttribution with empty fields on null result

## 8. Pipeline Orchestration

- [x] 8.1 Rewrite `src/eval/focus/index.ts` — update `runFocusPipeline` flow: `buildSkeleton → writeLibrary → runAgent(SCAN) → runAgent(ZOOM) for each zone → runAgent(SYNTHESIZE) → composeEvalResult`
- [x] 8.2 Create `ProgressDisplay` instance at pipeline start, pass callbacks to each Agent session
- [x] 8.3 Implement Phase 0 progress (落盘) with file write counts
- [x] 8.4 Wire progress events from agent-loop callbacks to ProgressDisplay
- [x] 8.5 Show completion summary after all phases
- [x] 8.6 Handle `noIssuesDetected` early return with rule engine result
- [x] 8.7 Handle pipeline-level failure: fall back to rule engine with `analysisMode: "rule"` annotation
- [x] 8.8 `composeEvalResult` maps Agent outputs to EvalResult (existing function, verify compatibility with new Agent output format)

## 9. Integration & Cleanup

- [x] 9.1 Verify `src/eval/index.ts` path selection logic unchanged — `FOCUS_PATH_THRESHOLD = 500` still routes to `runFocusPipeline`
- [x] 9.2 Verify `src/eval/llm.ts` fast path untouched — `runCausalGraphPipeline` and all `executeStep1-6` remain unchanged
- [x] 9.3 Remove `schemas.ts` import for `completeSimple` from focus/scan.ts, zoom.ts, synthesize.ts (replaced by agent-loop)
- [x] 9.4 Ensure no imports broken — `focus/index.ts` still exports `runFocusPipeline` and `FOCUS_PATH_THRESHOLD`
- [x] 9.5 Run typecheck: `npm run typecheck` passes with zero errors

## 10. Tests

- [x] 10.1 Unit test `agentLoop()` with mock harness: verify loop exits on valid JSON, retries on invalid JSON, enforces soft limit, emits progress events
- [x] 10.2 Unit test tool sandbox: `read_file` rejects `../` paths, `write_file` rejects writes outside notebook/ and output/
- [x] 10.3 Unit test `writeLibrary()`: verify all files created with correct content, step partitioning, signal grouping
- [x] 10.4 Unit test `cleanOldWorkspaces()`: verify retention logic, oldest directory removed
- [x] 10.5 Unit test `ProgressDisplay`: verify phase lifecycle events produce correct terminal output structure
- [x] 10.6 Unit test Agent system prompts: verify they contain required sections (role, workspace guidance, output schema)
- [x] 10.7 Integration test: run `runFocusPipeline` on a mock 500+ step session — verify pipeline completes, EvalResult valid, workspace files created
- [x] 10.8 Regression test: verify `runCausalGraphPipeline` unchanged for <500 step sessions
