## 1. Create ImageManager

- [x] 1.1 Create `src/ui/image-manager.ts` with `ImageManager` class: `images: ImageContent[]` private array, `add(img)`, `removeLast()`, `drain()`, `count` getter, `clear()`
- [x] 1.2 Add unit tests for `ImageManager` in `tests/ui/image-manager.test.ts`: add/count, removeLast (LIFO), removeLast on empty, drain captures-and-clears, drain returns copy not reference, drain on empty, clear

## 2. Create ImagePasteHandler

- [x] 2.1 Create `src/ui/image-paste-handler.ts` with `ImagePasteHandler` class: constructor takes `ImageManager`, `Editor`, `ConversationView`, `imageStatus` Text, `TUI`; exposes `addImage`, `removeLastImage`, `drainImages`, `imageCount`, `clear`, `updateStatus`
- [x] 2.2 Implement `addImage`: calls `imageManager.add(img)` → `editor.insertText([image])` → `conversation.addDraftImage()` → `updateStatus()` → `tui.requestRender(true)`
- [x] 2.3 Implement `removeLastImage`: calls `imageManager.removeLast()` → `conversation.removeLastDraftImage()` → `updateStatus()`
- [x] 2.4 Implement `drainImages`: delegates to `imageManager.drain()`
- [x] 2.5 Implement `clear`: calls `imageManager.clear()` → `updateStatus()`
- [x] 2.6 Implement `updateStatus`: reads `imageManager.count`, formats KB from imageManager images, sets `imageStatus.setText()`, calls `tui.requestRender(true)`

## 3. Wire ImagePasteHandler into TuiApp

- [x] 3.1 Add `private imagePasteHandler: ImagePasteHandler` field to `TuiApp`, instantiate in constructor after `imageStatus` is created
- [x] 3.2 Replace `onChange` handler: replace `this.pendingImages.pop()` / `this.conversation.removeLastDraftImage()` / `this.updateImageStatus()` with `this.imagePasteHandler.removeLastImage()`
- [x] 3.3 Replace 4 paste-site blocks (Bracketed `handlePasteImage`, Kitty `handleKittyImageProtocol`, Ctrl+V `pasteClipboardImage`, empty-submit `handleSubmit`) — each `slice → push pendingImages → push imageStore → addDraftImage` replaced with `this.imagePasteHandler.addImage(img)`
- [x] 3.4 Replace `handleSubmit` image capture: `this.imageStore = this.imageStore.slice(...)` / `this.imageStore.length > 0 ? [...this.imageStore]` replaced with `this.imagePasteHandler.drainImages()`. Call `drainImages()` BEFORE `editor.setText("")`.
- [x] 3.5 Replace `clearConversationView`: `this.pendingImages = []` / `this.imageStore = []` / `this.updateImageStatus()` replaced with `this.imagePasteHandler.clear()`
- [x] 3.6 Replace `addPendingImage` method body: delegate to `this.imagePasteHandler.addImage(image)`
- [x] 3.7 Replace `updateImageStatus` method body: delegate to `this.imagePasteHandler.updateStatus()`
- [x] 3.8 Replace `handleSubmit` image-check conditions: `this.pendingImages.length > 0` → `this.imagePasteHandler.imageCount > 0`
- [x] 3.9 Remove `pendingImages: ImageContent[]` and `imageStore: ImageContent[]` fields from `TuiApp`

## 4. Verify behavior and cleanup

- [x] 4.1 Run `npm run typecheck` and fix any type errors
- [x] 4.2 Run `npm test` and ensure all existing tests pass
- [x] 4.3 Manually verify the 6-attempt bug scenarios: (a) paste → delete → paste → send = 1 image, (b) paste → delete → type text → send = 0 images
- [x] 4.4 Verify paste protocols: Bracketed paste (terminal paste), Kitty protocol, Ctrl+V keybinding, empty-submit auto-paste
- [x] 4.5 Verify `clearConversationView` resets images and status
- [x] 4.6 Verify image status display updates correctly (count, KB, "type text and press Enter")
- [x] 4.7 Verify `drain()` atomicity: confirm no race window between `handleSubmit` capture and `onChange` triggered by `setText("")`
- [x] 4.8 Remove the `IMAGE_PLACEHOLDER` constant if no longer directly referenced in TuiApp
- [x] 4.9 Run full lint/typecheck/test suite; ensure `tui-app.ts` is significantly shorter (~920 lines)
