## Why

The eval system currently has a dual-path architecture: a LLM-driven CHIFF causal graph pipeline with a deterministic rule-engine fallback (`analyzer.ts`). The fallback is treated as an equivalent alternative, but in practice it produces fundamentally lower-quality analysis — it cannot detect AGENTS.md configuration issues, cannot reason about creative drift or taste degradation, and relies on hardcoded Chinese keyword whitelists and Jaccard distance heuristics that miss the actual problems. Worse, when the LLM pipeline fails silently (as it has for the last 10 consecutive evals), users see "LLM Unavailable" and get an empty analysis with zero triggered rules — but no error message telling them the pipeline broke. The rule-engine fallback creates a false sense of reliability while masking real failures.

The agent should own every analytical decision. Phase detection, deviation identification, root cause inference — these are reasoning tasks, not pattern-matching tasks. They belong to the LLM, not to a bag of regexes and keyword sets.

## What Changes

- **Remove `/eval` rule-engine fallback** — LLM pipeline failure now surfaces as an error to the user instead of silently degrading to low-quality analysis. **BREAKING**: the fallback path is removed.
- **Remove deterministic phase detection** (`detectPhases`) — phases are now derived exclusively from LLM subtask decomposition (Step 1).
- **Remove deterministic deviation detection** (`detectDeviations`, `extractScreenshotKeywords`, `extractTargetKeywords`, `jaccardDistance`) — deviations are now identified by the LLM during causal graph analysis.
- **Remove deterministic root cause inference** (`inferRootCauses`) — root causes are now exclusively from LLM Step 6 counterfactual attribution.
- **Remove user complaint regex** (`isUserComplaint`, `getUserComplaintPatterns`) — the LLM understands natural language; it doesn't need `/不对|错了|错误/` to recognize frustration.
- **Remove Chinese visual keyword whitelist** (`CHINESE_VISUAL_KEYWORDS`) — 60+ hardcoded terms like "金属", "玻璃", "布料" are a brittle approximation of visual understanding.
- **Remove heuristic session compaction** (`compactSession`) — the LLM pipeline now handles session representation directly.
- **Replace `analyzer.ts` (~700 lines) with `computeStats.ts` (~40 lines)** — pure computation only: metadata extraction, tool call counting, error rate calculation. No inference, no rules.
- **Fix misleading dashboard label** — remove hardcoded "LLM Unavailable" text; the dashboard only renders in LLM mode. **BREAKING**: `analysisMode` type narrows from `"llm" | "rule"` to `"llm"`.
- **Fix silent error swallowing** — the CHIFF pipeline catch block now logs the specific step and error before re-throwing.

## Capabilities

### New Capabilities
- `eval-stats-computation`: Pure computational stats extraction (metadata, tool counts, error rates) separated from inference logic

### Modified Capabilities
- `eval-causal-graph`: Remove fallback-to-rule-engine requirement. LLM failures now propagate as errors. Phase/deviation/root-cause derivation now exclusively from LLM.
- `eval-dashboard`: Remove rule-engine analysis mode badge. `analysisMode` is now always `"llm"`. Sections previously conditional on analysis mode become unconditional.
- `eval-llm-rule-attribution`: Remove the non-attribution fallback path (was needed when rule engine ran without CHIFF). `attributeWithLLM` now always receives graph context.
- `harness-rule-extraction`: Remove the concept of "non-attribution-dependent detectors". All rule extraction is now LLM-driven with full graph context.

## Impact

- `src/eval/analyzer.ts` — **deleted**, replaced by `src/eval/stats.ts` (~40 lines of pure computation)
- `src/eval/llm.ts` — catch block removed; pipeline failure propagates as error; `mergePipelineResults` simplified (no rule-engine fields to merge)
- `src/eval/index.ts` — no fallback path; LLM-unavailable → error to user
- `src/eval/dashboard.ts` — remove `analysisMode` conditional rendering; remove "LLM Unavailable" badge
- `src/eval/types.ts` — `analysisMode` narrowed to `"llm"`; `PhaseInfo`, `DeviationPoint`, `RootCause` may be simplified
- `src/eval/focus/skeleton.ts` — remove dependency on rule-engine `EvalResult`; skeleton built from pure stats
- `src/eval/focus/index.ts` — `runFocusPipeline` receives stats instead of full `EvalResult`
- `src/eval/prompts.ts` — Step 5/6 prompts enhanced to also produce phase summaries and deviation points
- `src/eval/schemas.ts` — `Attribution` extended with phase and deviation output fields
- `openspec/specs/eval-causal-graph/spec.md` — remove fallback requirements
- `openspec/specs/eval-dashboard/spec.md` — remove rule-engine mode requirements
- `openspec/specs/harness-rule-extraction/spec.md` — remove deterministic detector requirements
