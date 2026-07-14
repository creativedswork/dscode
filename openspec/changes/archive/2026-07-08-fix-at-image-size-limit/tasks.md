## 1. Config type and defaults

- [x] 1.1 Add `maxImageSize` to `AtFileConfig` in `src/core/types.ts`
- [x] 1.2 Add `atFileMaxImageSize` config key with default `20 * 1024 * 1024` in `src/core/config.ts`

## 2. Core resolver logic

- [x] 2.1 Replace `maxFileSize` check for images in `resolveAtFileRefs` with `maxImageSize` check using `resolvedLimits` from config
- [x] 2.2 Stop adding image file sizes to `totalContentSize` (images don't count toward `maxTotalSize`)
- [x] 2.3 Update `DEFAULT_LIMITS` to include `maxImageSize: 20 * 1024 * 1024`
- [x] 2.4 When image exceeds `maxImageSize`, set `reject: true` on `AtFileResolveResult` and emit a warning — do NOT skip silently

## 3. Rejection handling in TUI and Web UI

- [x] 3.1 TUI `handleSubmit`: check `resolved.reject`, if true show warnings and return without calling `promptWithImages()` or `agent.prompt()`
- [x] 3.2 Web UI `handleMessage` "chat": check `resolved.reject`, if true send error to client and return without forwarding prompt

## 4. Verify existing merge paths

- [x] 4.1 Verify TUI merges resolved @-images with paste images and calls `promptWithImages()` — no code change needed (already correct)
- [x] 4.2 Verify Web UI merges resolved @-images and calls `promptWithImages()` — no code change needed (already correct)
