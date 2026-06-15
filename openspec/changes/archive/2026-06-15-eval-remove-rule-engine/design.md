## Context

The eval system currently has two analysis paths: a LLM-driven CHIFF causal graph pipeline (`llm.ts`) and a deterministic rule engine (`analyzer.ts`). The rule engine serves dual roles: (1) primary analysis when LLM is unavailable (fallback), and (2) data provider for the LLM pipeline (metadata, stats, skeleton). After 10+ consecutive evals all silently degrading to rule-engine mode with empty results, it's clear this dual-path architecture creates more problems than it solves — the fallback masks pipeline failures, and the deterministic heuristics produce low-quality, unmaintainable analysis.

The CHIFF 6-step LLM pipeline and Focus 3-pass pipeline are well-designed and should be preserved. The problem is exclusively in the deterministic analyzers that attempt to replace LLM reasoning with pattern matching.

## Goals / Non-Goals

**Goals:**
- Eliminate all deterministic inference from the eval system
- Make LLM pipeline failure a visible error, not a silent degradation
- Preserve CHIFF 6-step and Focus 3-pass LLM pipeline structures
- Extract pure computation (stats) into a minimal, testable module
- Update all four eval-related specs to remove rule-engine requirements

**Non-Goals:**
- Change CHIFF 6-step structure (it remains LLM-driven step-by-step)
- Change Focus 3-pass structure (it remains scan → zoom → synthesize)
- Add new LLM calls beyond what currently exists in Step 5/6 (enhance prompts, don't add calls)
- Remove the Focus pipeline
- Change the rule store or semantic merge

## Decisions

### Decision 1: Stats extraction is pure computation, separate from inference

**Choice**: Extract metadata and tool statistics into `src/eval/stats.ts` as a ~40 line pure function. No inference, no heuristics, no keyword matching.

**Rationale**: Message counting, error rate calculation, and metadata formatting are not "rules" — they're data transformations. They should stay deterministic because they have no ambiguity. Separating them from inference makes the boundary clear.

**Alternatives considered**:
- Have LLM compute stats → unnecessary, wastes tokens on arithmetic
- Keep stats in analyzer.ts → bloats a file we want to delete

### Decision 2: Phase/deviation/rootCause now come from LLM Step 1 + Step 6

**Choice**: Instead of `detectPhases()` signal heuristics, phases are derived from Step 1 subtask decomposition. Deviations are included in Step 5 candidate error set output (extended schema). Root causes are exclusively from Step 6 attribution.

**Rationale**: Step 1 already produces subtasks with step ranges and oracle goals — these ARE phases. Step 5 already produces candidate error steps with impact scores — these ARE deviations. Step 6 already produces a root cause with reasoning — this IS the root cause. No additional LLM calls needed; just extend the existing output schemas to include the fields the dashboard needs.

**Alternatives considered**:
- Add new LLM call for phase/deviation → unnecessary, duplicates work done in Steps 1-6

### Decision 3: LLM pipeline failure is a hard error

**Choice**: Remove the `catch` block in `runCausalGraphPipeline`. If any LLM step fails after retry, throw the error to `runEval`, which surfaces it to the user via `ui.addError()`.

**Rationale**: Silently degrading to rule-engine mode has hidden systemic LLM failures for 10 consecutive evals. The user deserves to know when analysis fails. They can retry or investigate.

**Alternatives considered**:
- Keep fallback but show a prominent warning → still produces low-quality analysis; user may not notice the warning

### Decision 4: Remove `analysisMode` from types

**Choice**: Remove `analysisMode: "llm" | "rule"` from `EvalResult`. The dashboard no longer needs to conditionally render sections for a mode that doesn't exist.

**Rationale**: There is only one mode now. Conditional rendering for a non-existent mode is dead code.

**Alternatives considered**:
- Keep `analysisMode` always set to `"llm"` → unnecessary field, adds confusion

### Decision 5: Dashboard sections that were LLM-only become unconditional

**Choice**: Causal graph visualization, data flow paths, and rule reasoning chain sections render unconditionally. They were previously hidden in rule-engine mode, which no longer exists.

**Rationale**: These sections are the primary value of the eval dashboard. If the LLM pipeline failed, there is no dashboard at all (the error surfaces to the user).

### Decision 6: attributeWithLLM always receives full graph context

**Choice**: Remove the fallback path in `attributeWithLLM` where it could be called with `graphStore = null` and `attribution = null`. Always require graph context.

**Rationale**: The fallback path existed only for rule-engine mode. Without rule-engine mode, `attributeWithLLM` is always called after a successful CHIFF pipeline.

## Risks / Trade-offs

**[Risk] LLM pipeline is now a single point of failure for eval**
→ **Mitigation**: Users see an explicit error message and can retry. The 6-step + retry-per-step architecture already provides resilience. The current silent degradation is worse — users get a false sense of analysis quality.

**[Risk] LLM may produce inconsistent phase/deviations compared to deterministic heuristics**
→ **Mitigation**: LLM analysis is semantically richer — it understands context, not just keyword overlap. Consistency across runs is not a goal; accuracy is. Same session re-evaluated may produce different-but-valid analyses.

**[Risk] Removing user complaint regex may miss edge cases**
→ **Mitigation**: The LLM understands natural language far better than `/不对|错了/`. The regex was already only used for `userComplaints` stat counting in the dashboard — the LLM identifies complaints during Step 1-6 analysis.

**[Risk] Focus pipeline skeleton currently depends on rule-engine EvalResult**
→ **Mitigation**: `buildSkeleton()` receives `SessionStats` (from new `stats.ts`) instead of full `EvalResult`. The skeleton builder uses stats and steps, not rule-engine phases/deviations.

## Migration Plan

1. Create `src/eval/stats.ts` with pure computation
2. Extend Step 5/6 schemas with phase/deviations fields
3. Update prompts to produce extended output
4. Update `llm.ts` to remove catch block, use stats directly
5. Update `focus/` to use stats instead of rule-engine EvalResult
6. Update dashboard to remove `analysisMode` conditional logic
7. Delete `analyzer.ts`
8. Update all four specs
9. Test on existing session data

Rollback: Revert to prior commit. No data migration needed (rule store is unchanged).
