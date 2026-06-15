## 1. Causal Graph Pipeline Progress

- [x] 1.1 Add `onLog?: (msg: string) => void` parameter to `runCausalGraphPipeline` in `src/eval/llm.ts`
- [x] 1.2 Insert `onLog?.("Step 1/6: 分解子任务...")` / `onLog?.("Step 1/6 ✓")` before/after `executeStep1`
- [x] 1.3 Insert `onLog?.("Step 2/6: 识别子任务依赖...")` / `onLog?.("Step 2/6 ✓")` before/after `executeStep2`
- [x] 1.4 Insert `onLog?.("Step 3/6: 提取 Agent 节点...")` / `onLog?.("Step 3/6 ✓")` before/after `executeStep3`
- [x] 1.5 Insert `onLog?.("Step 4/6: 识别 Agent 依赖边...")` / `onLog?.("Step 4/6 ✓")` before/after `executeStep4`
- [x] 1.6 Insert `onLog?.("Step 5/6: 生成候选错误集...")` / `onLog?.("Step 5/6 ✓")` before/after `executeStep5`
- [x] 1.7 Insert `onLog?.("Step 6/6: 反事实归因...")` / `onLog?.("Step 6/6 ✓")` before/after `executeStep6`
- [x] 1.8 Pass `onLog` from `runEval` to `runCausalGraphPipeline` in `src/eval/index.ts`

## 2. ProgressDisplay Refactor

- [x] 2.1 Change `ProgressDisplay` constructor to accept `{ disableTerminal, onLog, throttleMs }` options in `src/eval/focus/progress.ts`
- [x] 2.2 Add `lastOnLogTime: number` field and throttle logic to `onPhaseProgress`
- [x] 2.3 In `onPhaseProgress`, when `onLog` is set, call `onLog("  ⟳ " + event.detail)` (throttled)
- [x] 2.4 Update `runFocusPipeline` call site in `src/eval/focus/index.ts` to use new constructor signature
- [x] 2.5 Verify `isWebMode`-dependent logic (`this.isWebMode`) is replaced with `this.disableTerminal`

## 3. Crash Error Logging

- [x] 3.1 In `src/eval/index.ts` catch block, add `logEval("error", "Pipeline", "crash: " + ...)` call
- [x] 3.2 Add `logEval("error", "Pipeline", "stack:\n" + err.stack)` when stack is available
- [x] 3.3 Import `logEval` in `src/eval/index.ts` (currently imports only `clearEvalLog`)

## 4. Verify & Test

- [x] 4.1 Run `npm run typecheck` to verify no type errors
- [x] 4.2 Run existing tests: `npm test`
- [ ] 4.3 Manual test: `/eval` on a session with < 500 steps — verify 6 step progress messages appear
- [ ] 4.4 Manual test: `/eval` on a session with ≥ 500 steps — verify phase + tool progress messages appear
- [ ] 4.5 Manual test: trigger a pipeline error — verify crash logged to `~/.dscode/logs/eval.log`
