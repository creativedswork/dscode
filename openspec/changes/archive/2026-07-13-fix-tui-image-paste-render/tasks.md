## 1. Fix pasteClipboardImage async render

- [x] 1.1 In `src/ui/tui-app.ts` `pasteClipboardImage()`, add `setTimeout(() => this.tui.requestRender(true), 0)` after `this.imagePasteHandler.addImage(img)` in the `.then()` success callback
- [x] 1.2 Ensure the same deferred render is added in the `pasteClipboardImage()` path within `handleSubmit` (empty-submit clipboard read at ~line 1205+1216)

## 2. Fix handleKittyProtocol async render

- [x] 2.1 In `src/ui/tui-app.ts` `handleKittyProtocol()`, replace `queueMicrotask(() => this.imagePasteHandler.addImage(img))` with `queueMicrotask(() => { this.imagePasteHandler.addImage(img); setTimeout(() => this.tui.requestRender(true), 0); })`

## 3. Verify

- [x] 3.1 Run `npm run typecheck`
- [ ] 3.2 Manually test: Ghostty Cmd+V screenshot paste → `[image:N]` appears immediately without keystroke
- [ ] 3.3 Manually test: file drag-drop still works (no regression)
- [ ] 3.4 Manually test: `/image clipboard` slash command still works
- [x] 3.5 Remove diagnostic logs added during exploration (`git checkout -- src/ui/tui-app.ts` then re-apply only the fixes)
