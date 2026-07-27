# Tasks

## 1. Bump package versions
- [x] Edit `package.json`, update `@earendil-works/pi-ai` from `^0.80.3` to `^0.80.10`
- [x] Edit `package.json`, update `@earendil-works/pi-agent-core` from `^0.80.3` to `^0.80.10`
- [x] Edit `package.json`, update `@earendil-works/pi-tui` from `^0.74.0` to `^0.80.10`

## 2. Install and verify build
- [x] Run `rm -rf node_modules && npm install` to get clean dependency tree
- [x] Run `npm run typecheck` — must pass with zero errors
- [x] Run `npm run build` — must succeed end-to-end

## 3. Update getThinkingLevel for kimi-k3
- [x] Edit `src/models/registry.ts`: update `getThinkingLevel` to check `model.thinkingLevelMap` — if only `"max"` is non-null, return `"max"`; if all are null, return `"off"`; otherwise keep existing `reasoning → "high" | "off"` logic
- [x] Run `npm run typecheck` after change
- [x] Verify: `getThinkingLevel("kimi-coding", "k3")` returns `"max"`

## 4. Smoke test — TUI rendering
- [ ] Run `npm start` — verify conversation view renders correctly
- [ ] Test image paste (if Kitty/iTerm2 available) — verify Image component renders
- [ ] Test editor input, history navigation, slash commands
- [ ] Verify no visual regressions in Markdown, SelectList, or other TUI components

## 5. Smoke test — kimi-k3 model
- [ ] Set `KIMI_API_KEY` environment variable
- [ ] Run `npm start` with kimi-coding provider and k3 model
- [ ] Verify model resolution succeeds
- [ ] Send a test prompt and verify streaming works
- [ ] Verify image input works (if applicable)

## 6. Smoke test — Qwen provider
- [ ] Set `DASHSCOPE_API_KEY` environment variable (or use existing)
- [ ] Run `npm start` with qwen provider
- [ ] Verify model resolution and streaming still work
- [ ] Verify `thinkingFormat: "qwen"` still produces correct API requests
