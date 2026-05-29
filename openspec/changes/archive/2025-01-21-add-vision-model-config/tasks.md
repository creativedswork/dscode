## 1. Config layer

- [x] 1.1 Add `vision?: { provider: string; model: string; key?: string }` to `HarnessConfig` in `src/core/types.ts`
- [x] 1.2 Add `vision` object loading in `loadConfig()` in `src/core/config.ts` (read from `userConfig.vision` with env var override via `AGENT_VISION_PROVIDER` / `AGENT_VISION_MODEL`)
- [x] 1.3 Add `visionProvider` / `visionModelId` / `visionKey` to `/config` default output in `src/ui/commands.ts`

## 2. Slash commands

- [x] 2.1 Add `/config vision-provider <id>` command in `src/ui/commands.ts` — list providers when no arg, switch when arg given (clears visionModelId on provider change)
- [x] 2.2 Add `/config vision-model <id>` command in `src/ui/commands.ts` — list models for current vision provider when no arg, switch when arg given
- [x] 2.3 Add `/config vision-key <key>` command in `src/ui/commands.ts` — save vision API key to `config.json` with masked confirmation

## 3. Vision model prompt logic in Harness

- [x] 3.1 Add `resolveVisionModel()` private method to `Harness` — returns `{ model, apiKey }` or `null` if vision model is not configured or cannot be resolved
- [x] 3.2 Add `describeImagesViaVisionModel(images: ImageContent[], visionModel, apiKey): Promise<string>` private method — calls vision model with a "describe these images" prompt using `streamSimple`, returns the text response
- [x] 3.3 Add `promptWithImages(text: string, images: ImageContent[]): Promise<void>` method to `Harness` — implements the routing logic:
  - If vision model configured and resolvable → call vision model for description, inject into text, call `agent.prompt(enrichedText)`
  - If vision model fails → fall back to OCR path (call `ocrImages` then `agent.prompt`)
  - If no vision model and main model supports images → `agent.prompt(text, images)`
  - If no vision model and main model doesn't support images → OCR

## 4. Update TUI image handling

- [x] 4.1 Replace OCR/vision logic in `handleSubmit` (`src/ui/tui-app.ts`) with call to `harness.promptWithImages(text, images)`
- [x] 4.2 Remove or simplify `modelNeedsOcr` from `TuiDeps` since routing is now in Harness
- [x] 4.3 Keep `modelSupportsImages` for the image status warning display only (cosmetic)

## 5. Update Web UI image handling

- [x] 5.1 Replace OCR/native-image branching in `handleMessage` chat case (`src/ui/web/web-backend.ts`) with call to `harness.promptWithImages(text, images)`
- [x] 5.2 Remove local `needsOcr` and `nativeImageSupport` checks from web-backend since routing is in Harness
- [x] 5.3 Add `vision` field to `ConfigData` in `src/ui/web/protocol.ts`
- [x] 5.4 Add `set_vision_provider` / `set_vision_model` / `set_vision_key` actions to `ClientCommand` in `src/ui/web/protocol.ts`
- [x] 5.5 Update `buildConfigData()` in `web-backend.ts` to include vision config
- [x] 5.6 Handle vision config actions in web-backend config handler

## 6. Update Web frontend config UI

- [x] 6.1 Add `vision` field to `ConfigData` in `web/src/types/index.ts`
- [x] 6.2 Add `set_vision_provider` / `set_vision_model` / `set_vision_key` actions to `ClientCommand` in `web/src/types/index.ts`
- [x] 6.3 Add vision provider/model/key inputs to Settings panel in `web/src/components/Sidebar.tsx` (model dropdown filtered by image support via `visionModels`)
- [x] 6.4 Handle vision config actions in `web/src/components/App.tsx` (no change needed — generic passthrough)

## 7. Verification

- [x] 7.1 `npm run typecheck` passes with zero errors
- [ ] 7.2 Manual test: configure vision model, send image prompt → vision model is used, main model receives text description
- [ ] 7.3 Manual test: no vision model configured, main model supports images → images passed directly
- [ ] 7.4 Manual test: no vision model configured, main model doesn't support images → OCR fallback works
- [ ] 7.5 Manual test: vision model configured but API key missing → warning shown, OCR fallback works
- [ ] 7.6 Manual test: TUI `/config` output shows vision provider/model/key status
- [ ] 7.7 Manual test: TUI `/config vision-provider`, `/config vision-model`, `/config vision-key` commands work correctly
- [ ] 7.8 Manual test: Web UI Settings panel shows and allows editing vision provider/model/key
