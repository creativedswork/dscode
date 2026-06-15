## 1. Agent nodes — deterministic construction

- [x] 1.1 Add `buildAgentNodes(steps: HistoryStep[], subtasks: Subtask[]): AgentNode[]` function in `src/eval/llm.ts`
- [x] 1.2 Function iterates each subtask's step range, maps `HistoryStep` fields to `AgentNode.otar`, returns flat array
- [x] 1.3 Handle edge cases: empty steps, empty subtasks, subtask range out of bounds — return `[]` or skip, never throw

## 2. Data flows — simplified LLM prompt

- [x] 2.1 Modify `buildStep3Prompt()` in `src/eval/prompts.ts` to remove agent nodes output format; keep only `dataFlows`
- [x] 2.2 Reduce prompt content: replace full history summary with subtask-level step range + agent/action list
- [x] 2.3 Add `buildStep3SingleSubtaskPrompt()` in `src/eval/prompts.ts` for per-subtask divide-and-conquer calls

## 3. ExecuteStep3 — integrate

- [x] 3.1 Rewrite `executeStep3()`: call `buildAgentNodes()` for agents, iterate subtasks calling LLM per subtask, aggregate results
- [x] 3.2 Implement graceful degradation: per-subtask failures (no JSON / parse / validation) log warning and skip, do not block pipeline
- [x] 3.2 Remove `repairTruncatedJSON` if still present (should already be gone from prior cleanup)
- [x] 3.3 Ensure function signature unchanged: `Promise<{ agents: AgentNode[]; dataFlows: StepDataFlow[] }>`
- [x] 3.4 Summary warning logged when N/M subtasks fail to produce data flows

## 4. Verify

- [x] 4.1 Run `npm run typecheck` — no errors
- [x] 4.2 Run `npm test` — all existing eval tests pass (2 pre-existing failures in recovery-arc.test.ts unrelated to this change; 1 pre-existing UI test failure)
- [x] 4.3 Manual: run `/eval <session>` and verify dashboard renders agent nodes correctly
- [x] 4.4 Manual: run `/eval` on large session (500+ steps) to verify divide-and-conquer avoids token truncation
