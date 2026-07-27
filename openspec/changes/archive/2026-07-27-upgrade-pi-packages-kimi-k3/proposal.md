## Why

dscode currently pins pi-ai, pi-agent-core, and pi-tui at versions that predate the kimi-k3 model. pi-ai@0.80.10 ships k3 as a built-in model under the `kimi-coding` provider (1M context window, 128K max tokens, anthropic-messages API). Upgrading unlocks k3 support with zero custom provider code, while also picking up 7 versions of upstream fixes and improvements across all three packages.

## What Changes

- **Bump `@earendil-works/pi-ai`** from `^0.80.3` to `^0.80.10` — ships `k3` model in the `kimi-coding` built-in provider
- **Bump `@earendil-works/pi-agent-core`** from `^0.80.3` to `^0.80.10` — sync with pi-ai
- **Bump `@earendil-works/pi-tui`** from `^0.74.0` to `^0.80.10` — sync with pi-ai; largest version jump, needs behavioral verification
- **Update `getThinkingLevel`** in `registry.ts` to handle kimi-k3: the k3 model maps only `"max"` → reasoning enabled, all other levels → `null`. dscode's thinking level heuristic should return `"high"` for models with reasoning but with `thinkingLevelMap` that only enables at max.
- **Verify Qwen custom provider** still registers correctly with the updated `createProvider`/`lazyApi`/`envApiKeyAuth` APIs
- **Verify pi-tui runtime behavior** — TUI component constructors (Image, Editor in particular) may have changed between 0.74 and 0.80

## Capabilities

### New Capabilities

- `kimi-k3-support`: Users can select `kimi-coding` / `k3` as their provider/model and authenticate with `KIMI_API_KEY`. The model uses the anthropic-messages API at `https://api.kimi.com/coding` and supports text+image input with a 1M context window.

### Modified Capabilities

- `model-registry`: `getThinkingLevel` must account for models whose `thinkingLevelMap` has limited level support (e.g., k3 where only `"max"` enables thinking). The heuristic should prefer `"high"` over `"off"` when reasoning is available but intermediate levels are null.

## Impact

- `package.json` — version bumps
- `src/models/registry.ts` — `getThinkingLevel` logic update for kimi-k3
- `node_modules/` — all three pi packages and their transitive deps
- TUI rendering — potential behavioral changes in pi-tui components (Image, Editor, Markdown rendering)
- No breaking API changes expected — all exported symbols dscode imports are verified present in 0.80.10
