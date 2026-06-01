## 1. ConversationView — draft image tracking

- [x] 1.1 Add `draftImageBlockCounts: number[]` field (LIFO stack) to `ConversationView`
- [x] 1.2 Add `addDraftImage(base64Data: string, mimeType: string, infoText: string): void` method that combines file save, cache path text block, optional inline image block, and info text block into one atomic operation, pushing the total block count onto `draftImageBlockCounts`
- [x] 1.3 Add `removeLastDraftImage(): void` method that pops the last count from `draftImageBlockCounts`, removes that many blocks from `this.blocks[]` via splice, removes the corresponding `box.children` tail via `removeChild()`, and decrements `renderedBlockCount`

## 2. TuiApp — consolidate paste sites to use addDraftImage

- [x] 2.1 Replace `addInlineImage()` + `addInfo()` in `handlePasteImage()` (bracketed paste) with `addDraftImage()`
- [x] 2.2 Replace `addInlineImage()` + `addInfo()` in `handleKittyImageProtocol()` with `addDraftImage()`
- [x] 2.3 Replace `addInlineImage()` + `addInfo()` in `pasteClipboardImage()` with `addDraftImage()`
- [x] 2.4 Replace `addInlineImage()` + `addInfo()` in `handleSubmit()` (empty-text clipboard fallback) with `addDraftImage()`

## 3. TuiApp — editor.onChange sync

- [x] 3.1 Extend `editor.onChange` to count `[image]` occurrences in the editor text and compare against `pendingImages.length`
- [x] 3.2 When placeholder count < pendingImages: pop from `pendingImages[]`, call `conversation.removeLastDraftImage()`, and call `updateImageStatus()` in a loop until counts match
- [x] 3.3 When placeholder count >= pendingImages: no-op (handles manual typing and equal-count cases)

## 4. Verify

- [x] 4.1 Run `npm run typecheck` and fix any type errors
- [ ] 4.2 Manual test: paste image, backspace `[image]`, verify conversation blocks disappear and status clears
- [ ] 4.3 Manual test: paste 3 images, delete 1, verify only the last group is removed
- [ ] 4.4 Manual test: paste image, delete `[image]`, type text, submit — verify no stale image is sent to model
