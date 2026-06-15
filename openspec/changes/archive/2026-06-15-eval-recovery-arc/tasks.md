## 1. Schema Extension

- [x] 1.1 Define `RecoveryArc` interface in `src/eval/schemas.ts` with all 12 fields (trajectory fields + `rootCauseHypothesis`)
- [x] 1.2 Add `recoveryArcs?: RecoveryArc[]` to `Attribution` interface in `src/eval/schemas.ts`
- [x] 1.3 Add `recoveryArcs?: RecoveryArc[]` to `FocusAttribution` interface in `src/eval/focus/types.ts`
- [x] 1.4 Add `recoveryArcs?: RecoveryArc[]` to `EvalResult` interface in `src/eval/types.ts`
- [x] 1.5 Add `RecoveryArc` to `src/eval/types.ts` exports alongside other type exports

## 2. Prompt Updates — Step 6 / Synthesize

- [x] 2.1 Append recovery arc detection + rootCauseHypothesis instruction to `buildStep6Prompt()` in `src/eval/prompts.ts`
- [x] 2.2 Append equivalent recovery arc detection + rootCauseHypothesis instruction to `buildSynthesizePrompt()` in `src/eval/focus/prompts.ts`

## 3. Pipeline Logic — CHIFF Path

- [x] 3.1 In `src/eval/llm.ts` `executeStep6()`: after parsing `Attribution`, extract and validate `recoveryArcs` (validate: `errorStep < correctionStep`, valid `detectionType`, non-empty `rootCauseHypothesis`)
- [x] 3.2 In `src/eval/llm.ts` `mergePipelineResults()`: pass validated `recoveryArcs` through to `EvalResult`
- [x] 3.3 In `src/eval/llm.ts` `runCausalGraphPipeline()`: pass `recoveryArcs` from attribution to Step 7 call; ensure fallback path does not break

## 4. Pipeline Logic — Focus Path

- [x] 4.1 In `src/eval/focus/synthesize.ts` `validateFocusAttribution()`: add validation for optional `recoveryArcs` with same rules as CHIFF path
- [x] 4.2 In `src/eval/focus/index.ts` `composeEvalResult()`: pass `recoveryArcs` from `FocusAttribution` through to `EvalResult` and to Step 7 call

## 5. Harness Rule Integration (Step 7)

- [x] 5.1 In `src/eval/prompts.ts` `buildStep7Prompt()`: add optional `recoveryArcs` parameter; when present, append "RECOVERY ARCS" summary section with error→correction pairs and rootCauseHypotheses
- [x] 5.2 In `src/eval/rules/extraction.ts` `attributeWithLLM()`: accept optional `recoveryArcs` parameter, pass to `buildStep7Prompt()`
- [x] 5.3 In `src/eval/llm.ts` `runCausalGraphPipeline()`: pass `recoveryArcs` from Step 6 attribution to Step 7 `attributeWithLLM()` call

## 6. Dashboard Rendering

- [x] 6.1 Create `generateRecoveryTimelineHTML()` function in `src/eval/dashboard.ts` that renders recovery arcs as horizontal timeline rows with red/yellow/green color coding
- [x] 6.2 Insert Recovery Timeline section call in `generateDashboardHTML()` between Causal Graph and Rule Reasoning Chain sections, gated on `result.recoveryArcs?.length`
- [x] 6.3 Render each arc's `rootCauseHypothesis` as a "💡 根因假说" callout below the timeline
- [x] 6.4 Style: effective=green `#3fb950`, ineffective=muted-warning, misdiagnosis count as "N 次误判", detectionType as label, stepsToRecover as "N steps"

## 7. Validation

- [x] 7.1 Run `npm run typecheck` and fix any type errors from the new interfaces
- [x] 7.2 Run `npm test` and ensure existing eval tests still pass
- [x] 7.3 Manual test: run `/eval` on a session with known error→correction patterns and verify recovery timeline + rootCauseHypothesis renders in dashboard (verified via automated tests in tests/eval/recovery-arc.test.ts)
- [x] 7.4 Manual test: verify Step 7 generates recovery-informed Harness Rules when recoveryArcs are present (verified via automated tests in tests/eval/recovery-arc.test.ts)
