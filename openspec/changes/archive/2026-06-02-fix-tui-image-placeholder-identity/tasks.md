## 1. ImageManager — ID support

- [x] 1.1 Add `nextId` counter (starts at 1) and `add()` returns assigned id
- [x] 1.2 Add `removeById(id: number): boolean` — removes image by id, returns success
- [x] 1.3 Add `getById(id: number): ImageContent | undefined`
- [x] 1.4 Add `getAllIds(): number[]` — returns active IDs in insertion order
- [x] 1.5 Update `clear()` to reset `nextId` to 1
- [x] 1.6 Remove `removeLast()` from public API
- [x] 1.7 Unit tests for ImageManager — add, removeById (found and not-found), getById, clear reset, drain order, getAllIds

## 2. ConversationView — ID-keyed draft management

- [x] 2.1 Change `draftImageBlockCounts: number[]` to `draftBlocks: Map<number, { startIndex: number; count: number }>`
- [x] 2.2 Update `addDraftImage` signature to `addDraftImage(id: number, base64Data: string, mimeType: string, infoText: string)`
- [x] 2.3 Implement `removeDraftImageById(id: number)` — splice blocks and adjust offsets of subsequent drafts
- [x] 2.4 Remove `removeLastDraftImage()` from public API
- [x] 2.5 Handle edge cases: remove middle draft (offsets shift), remove first/last, remove non-existent, clear session

## 3. ImagePasteHandler — ID-based API

- [x] 3.1 Change `PLACEHOLDER` from `"[image]"` to `"[image:"]` prefix; generate full placeholder from id
- [x] 3.2 `addImage(img)` returns assigned id (from ImageManager.add)
- [x] 3.3 Add `removeImageById(id: number)` — calls manager.removeById + conv.removeDraftImageById
- [x] 3.4 Add `getAllIds(): number[]` — delegates to ImageManager
- [x] 3.5 Remove `removeLastImage()` from public API
- [x] 3.6 Update `updateStatus()` to use ID-aware display if relevant

## 4. TuiApp — onChange ID-set diff

- [x] 4.1 Rewrite `editor.onChange` to extract IDs via `text.matchAll(/\[image:(\d+)\]/g)` into a `Set<number>`
- [x] 4.2 Compute removed IDs: `handler.getAllIds().filter(id => !presentIds.has(id))`
- [x] 4.3 Call `handler.removeImageById(id)` for each removed ID (ordered for consistency)
- [x] 4.4 Update pre-drain logic (Enter key) — if using `drainedSubmitImages`, onChange guard still works with new API
- [x] 4.5 Update handleSubmit — `drainImages()` API unchanged, confirm submit path works
- [x] 4.6 Update session restore path (`replayMessages`) — if images are re-added via `addImage`, IDs restart from 1

## 5. Tests

- [x] 5.1 Unit test ImageManager ID lifecycle: add returns sequential IDs, removeById, getById, getAllIds, drain order, clear reset
- [x] 5.2 Unit test ConversationView draft by-ID: add then removeById in various orders, verify block integrity
- [x] 5.3 Integration test TuiApp.onChange sync: paste 2 images, delete first placeholder → second image remains
- [x] 5.4 Integration test: corrupt placeholder → image removed
- [x] 5.5 Integration test: placeholder ID with no matching image → no-op
- [x] 5.6 Regression test: pre-drain on Enter still works with new API

## 6. Spec sync

- [x] 6.1 Archive old `tui-draft-image-sync` spec content replaced by new requirements
