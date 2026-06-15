## 1. Stats Extraction

- [x] 1.1 Create `src/eval/stats.ts` with `computeStats()` — pure computation of metadata + tool stats from `SerializedSession`, no inference
- [x] 1.2 Export `SessionStats` type containing `{ metadata: SessionMeta, stats: ToolStats }`

## 2. Schema Extensions

- [x] 2.1 Add `phaseStatus?: "ok" | "warn" | "danger"` to `Subtask` schema in `schemas.ts`
- [x] 2.2 Add `deviationDescription?: string` to `CandidateStep` schema in `schemas.ts`
- [x] 2.3 Add `rootCauseTitle?: string` and `rootCauseSeverity?: "primary" | "secondary"` to `Attribution` schema in `schemas.ts`
- [x] 2.4 Update `validateSubtasks()`, `validateCandidateSet()`, `validateAttribution()` to accept optional new fields

## 3. Prompt Updates

- [x] 3.1 Update `buildStep1Prompt()` — add `phaseStatus` field instruction to subtask output
- [x] 3.2 Update `buildStep5Prompt()` — add `deviationDescription` field instruction to candidate output
- [x] 3.3 Update `buildStep6Prompt()` — add `rootCauseTitle` and `rootCauseSeverity` fields to attribution output

## 4. LLM Pipeline

- [x] 4.1 Replace `analyzeSession()` call at top of `runCausalGraphPipeline()` with `computeStats()`
- [x] 4.2 Remove `catch` block — LLM step failures propagate as errors instead of falling back to rule engine
- [x] 4.3 Update `mergePipelineResults()` — derive phases from subtask `phaseStatus`, deviations from candidate `deviationDescription`, rootCauses from attribution `rootCauseTitle`/`rootCauseSeverity`
- [x] 4.4 Remove `analysisMode` from `mergePipelineResults()` return (always LLM now)
- [x] 4.5 Remove `compactSession()` call — LLM pipeline uses steps directly
- [x] 4.6 Add error logging in each `executeStep*()` function — log `[CHIFF Step N] Failed: {error}` before throwing

## 5. Focus Pipeline

- [x] 5.1 Update `runFocusPipeline()` signature — accept `SessionStats` instead of `EvalResult`
- [x] 5.2 Update `buildSkeleton()` — use `SessionStats` instead of `ruleResult` fields
- [x] 5.3 Update `composeEvalResult()` — derive phases/deviations/rootCauses from focus pipeline outputs, not rule engine
- [x] 5.4 Remove `budget-guard.ts` if it uses any rule-engine heuristics (keep pure budget enforcement)
- [x] 5.5 Update `runFocusPipeline()` early return — use `computeStats()` instead of `ruleResult`

## 6. Rule Attribution

- [x] 6.1 Update `attributeWithLLM()` — remove `graphStore: null` and `attribution: null` parameter paths; always require graph context
- [x] 6.2 Update `attributeWithLLM()` — accept `SessionStats` instead of raw `stats` and `meta` objects
- [x] 6.3 Remove `buildSessionFragments()` non-attribution fallback branch (the `if (mistakeStep === null)` path)

## 7. Dashboard

- [x] 7.1 Remove `analysisMode` conditional rendering in `generateDashboard()` — all sections now unconditional
- [x] 7.2 Remove "🤖 CHIFF Causal Graph Analysis" / "⚙ 规则引擎分析（LLM Unavailable）" badge from header
- [x] 7.3 Remove `generateRuleChainHTML()` — move rule chain rendering into unconditional section
- [x] 7.4 Update phase rendering to use `phaseStatus` from subtasks
- [x] 7.5 Update deviation rendering to use `deviationDescription` from candidates
- [x] 7.6 Update root cause rendering to use `rootCauseTitle` and `rootCauseSeverity` from attribution
- [x] 7.7 Remove stat card for "User Complaints" (LLM territory now, not regex-based counting)

## 8. Types Cleanup

- [x] 8.1 Remove `analysisMode` from `EvalResult` interface
- [x] 8.2 Remove `PhaseInfo`, `DeviationPoint`, `RootCause` from types if they're replaced by schema fields (or simplify to match new shape)
- [x] 8.3 Remove `CompactMessage` type and `compactSession()` export
- [x] 8.4 Add `SessionStats` type export

## 9. Analyzer Deletion

- [x] 9.1 Verify no remaining imports of `analyzer.ts` in any file
- [x] 9.2 Delete `src/eval/analyzer.ts`
- [x] 9.3 Update `src/eval/index.ts` — import `computeStats` instead of `analyzeSession`/`compactSession`
- [x] 9.4 Update `src/eval/index.ts` — LLM pipeline failure surfaces as `ui.addError()` instead of falling back

## 10. Spec Updates

- [x] 10.1 Update `openspec/specs/eval-causal-graph/spec.md` — apply delta from `specs/eval-causal-graph/spec.md`
- [x] 10.2 Update `openspec/specs/eval-dashboard/spec.md` — apply delta from `specs/eval-dashboard/spec.md`
- [x] 10.3 Update `openspec/specs/eval-llm-rule-attribution/spec.md` — apply delta from `specs/eval-llm-rule-attribution/spec.md`
- [x] 10.4 Update `openspec/specs/harness-rule-extraction/spec.md` — apply delta from `specs/harness-rule-extraction/spec.md`
- [x] 10.5 Create `openspec/specs/eval-stats-computation/spec.md` — from `specs/eval-stats-computation/spec.md`

## 11. Verification

- [x] 11.1 Run `npm run typecheck` — ensure no type errors from removed fields
- [x] 11.2 Run `/eval` on a known session — verify dashboard generates with all sections and no analysis mode badge
- [x] 11.3 Run `/eval` with intentionally bad LLM config — verify error surfaces to user (no silent degradation)
- [x] 11.4 Verify dashboard HTML contains causal graph, data flow, rule chain, phases from subtasks, deviations from candidates
