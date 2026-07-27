## 1. Register kimi provider in registry.ts

- [x] 1.1 Create `src/models/kimi.ts` with `KIMI_BASE_URL` constant and `KIMI_MODELS` map containing kimi-k3 model definition (openai-completions, baseUrl `https://api.moonshot.cn/v1`, reasoning: true, thinkingLevelMap with only max non-null, 1M context, 128K maxTokens, image input)
- [x] 1.2 In `src/models/registry.ts`, import from `kimi.ts`, call `createProvider()` with id `"kimi"`, auth `["KIMI_API_KEY", "MOONSHOT_API_KEY"]`, and `lazyApi(() => import("@earendil-works/pi-ai/api/openai-completions"))`, then `models.setProvider(kimiProvider)`
- [x] 1.3 Add `"kimi": "KIMI_API_KEY"` to `API_KEY_ENV_VARS` in `registry.ts`

## 2. Update provider config maps

- [x] 2.1 Add `"kimi": "KIMI_API_KEY"` to `PROVIDER_ENV_VARS` in `src/core/config.ts`

## 3. Verify

- [x] 3.1 Run `npm run typecheck` — must pass with zero errors
- [x] 3.2 Run `npm run build` — must succeed
- [x] 3.3 Verify `getAllProviders()` includes `"kimi"` and `"kimi-coding"`
- [x] 3.4 Verify `resolveModel("kimi", "kimi-k3")` returns correct model metadata
- [x] 3.5 Verify `getThinkingLevel("kimi", "kimi-k3")` returns `"max"`
- [x] 3.6 Verify `getAllModels("kimi")` includes `kimi-k3`
- [x] 3.7 Verify `getVisionModels("kimi")` includes `kimi-k3`

## 4. Smoke test

- [ ] 4.1 Set `KIMI_API_KEY` or `MOONSHOT_API_KEY` from platform.kimi.com
- [ ] 4.2 Run `AGENT_PROVIDER=kimi AGENT_MODEL=kimi-k3 npm start`
- [ ] 4.3 Verify model resolution succeeds (no 401)
- [ ] 4.4 Send a test prompt and verify streaming works
- [ ] 4.5 Verify pi-ai's built-in `kimi-coding` provider is still available and unaffected
