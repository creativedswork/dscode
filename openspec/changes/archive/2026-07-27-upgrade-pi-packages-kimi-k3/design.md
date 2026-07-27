## Context

dscode uses three `@earendil-works` packages as its AI platform layer:
- **pi-ai** — model abstraction, provider registry, streaming/completion APIs, auth helpers
- **pi-agent-core** — `Agent` class with tool execution lifecycle and event-driven loop
- **pi-tui** — Terminal UI components (Text, Box, Image, Editor, Markdown, etc.)

All three are currently at different versions (0.80.3 / 0.80.3 / 0.74.0). The latest release (0.80.10) unifies them and ships the `k3` model in the `kimi-coding` built-in provider. pi-ai has verified API stability — all symbols dscode imports (`createProvider`, `lazyApi`, `envApiKeyAuth`, `Type`, `Model`, etc.) are unchanged in 0.80.10.

## Goals / Non-Goals

**Goals:**
- Upgrade all three packages to `^0.80.10`
- Enable kimi-k3 model selection with zero custom provider code
- Ensure Qwen custom provider continues to register and stream correctly
- Verify pi-tui rendering behavior hasn't regressed

**Non-Goals:**
- Add any new custom providers
- Change the model registry architecture
- Add UI features or visual design changes

## Decisions

### D1: Bump all three packages to `^0.80.10` simultaneously

**Why**: pi-ai and pi-agent-core share version numbers intentionally — they are co-released. pi-tui is now also at 0.80.10, so a unified bump avoids peer-dependency mismatches. The `^` range allows future patch updates within 0.80.x.

**Alternatives considered**:
- *Bump only pi-ai*: Would leave pi-agent-core and pi-tui on older versions with potential runtime incompatibilities.
- *Pin exact versions*: Too restrictive — prevents patch fixes.

### D2: kimi-k3 uses built-in provider, no custom code

**Why**: pi-ai@0.80.10 already defines `k3` in `KIMI_CODING_MODELS` with the correct API (`anthropic-messages`), auth (`KIMI_API_KEY`), and compat settings (`allowEmptySignature`, `forceAdaptiveThinking`). The `KIMI_API_KEY` env var is already listed in dscode's `API_KEY_ENV_VARS` map. Zero code changes needed for model resolution or streaming — just the version bump.

**Alternatives considered**:
- *Write a custom provider*: Unnecessary duplication, would diverge from upstream.

### D3: getThinkingLevel maps k3's limited level support to "high"

**Why**: k3's `thinkingLevelMap` only enables thinking at `"max"` (all other levels are `null`). dscode's current `getThinkingLevel` only checks `model.reasoning` — if `true`, it returns `"high"`. This already works for k3 since `reasoning: true`. However, the function should also check `thinkingLevelMap` to avoid returning `"high"` for models where only max level enables thinking, which would cause pi-ai to send a thinking level the model doesn't accept.

**Decision**: When `reasoning: true` but `thinkingLevelMap` has only `"max"` as the sole non-null entry, return `"high"` (which pi-ai will map to `"max"`). For models with broader level support, keep the existing behavior. For models with `reasoning: true` but no non-null thinking levels, treat as `"off"`.

### D4: pi-tui behavioral verification is manual smoke test

**Why**: The pi-tui jump from 0.74 to 0.80 is significant, but we've verified all exported symbols dscode imports still exist. The risk is in internal rendering behavior (Image protocol selection, Editor keyboard handling, Markdown theme application). A manual smoke test covering the TUI screens (conversation view, editor, image paste, MCP browser) is the most efficient way to catch regressions.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| pi-tui Image component constructor signature changed | Smoke test image paste + Kitty/iTerm2 rendering |
| pi-tui Editor component keyboard handling changed | Test message input, paste, history navigation |
| `getThinkingLevel` returns wrong level for edge-case models | Verify against all providers: deepseek, qwen, kimi-coding, openai |
| Qwen `thinkingFormat: "qwen"` deprecated in 0.80.10 | Verified — `"qwen"` is still a valid union member in types.d.ts |
| Transitive dependency conflicts | `npm install` will surface any conflicts; clean `node_modules` before install |

## Migration Plan

1. **Pre-upgrade**: Run `npm run typecheck` on current codebase to establish clean baseline
2. **Bump**: Edit `package.json`, change versions
3. **Install**: `rm -rf node_modules && npm install`
4. **Build**: `npm run build`
5. **Typecheck**: `npm run typecheck`
6. **Smoke test TUI**: `npm start` — verify conversation rendering, image paste, editor input
7. **Smoke test kimi-k3**: `KIMI_API_KEY=<key> npm start` — verify model selection and streaming
8. **Rollback**: Revert `package.json` changes and `npm install`

## Open Questions

- (None — exploration phase resolved all unknowns. API compatibility verified by diffing 0.80.3 vs 0.80.10 exports.)
