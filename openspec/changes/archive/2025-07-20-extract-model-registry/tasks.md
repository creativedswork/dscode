## 1. Create models module structure

- [x] 1.1 Create `src/models/qwen.ts` — move `DASHSCOPE_BASE`, `QWEN_MODELS`, and `buildQwenModel` from `harness.ts`
- [x] 1.2 Create `src/models/registry.ts` — `ModelRegistry` singleton with provider registration, `resolve(provider, modelId)`, and thinking-level map
- [x] 1.3 Create `src/models/index.ts` — barrel export: `resolveModel(provider, modelId)`, `getThinkingLevel(provider, modelId)`, and provider registration

## 2. Wire harness and config to use the new module

- [x] 2.1 Replace inline model definitions and `resolveModel` in `harness.ts` with imports from `src/models/`
- [x] 2.2 Replace inline thinking-level heuristic in `Harness.setModel()` with `getThinkingLevel()` from models module
- [x] 2.3 Replace inline thinking-level heuristic in `config.ts:179` with `getThinkingLevel()` from models module

## 3. Verify

- [x] 3.1 Run `npm run typecheck` — zero errors
- [x] 3.2 Run `npm start` — verify model resolution works for qwen and other providers
- [x] 3.3 Test `/model` switching to verify thinking-level auto-adjustment still works
