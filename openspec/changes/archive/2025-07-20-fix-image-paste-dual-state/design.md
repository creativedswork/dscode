## Context

`TuiApp` currently uses two arrays to manage image lifecycle:

- `pendingImages: ImageContent[]` — UI layer, popped/pushed in `onChange` to track `[image]` placeholder count
- `imageStore: ImageContent[]` — data layer, written on paste, read in `handleSubmit`, "immune to onChange"

This separation exists because `onChange` fires both on user edits AND on `setText("")` (called by `handleSubmit`). If there were only one array, `handleSubmit`'s call to `setText("")` would trigger `onChange` → empty the array → data loss before submission.

The fix (attempt 6) synchronizes them via `slice(0, pendingImages.length)` at every paste entry and in `handleSubmit`. This works but duplicates logic across 4 paste sites and leaves the dual-state architecture intact.

Constraint: `@earendil-works/pi-tui` Editor is imperative, not reactive. `onChange` timing is not controllable. No transaction/batch-update mechanism exists.

## Goals / Non-Goals

**Goals:**
- Eliminate the dual-array pattern; image data is owned by a single `ImageManager`
- Provide an atomic `drain()` operation: capture all images AND clear them in one call — no window for races
- Extract image paste handling into a dedicated `ImagePasteHandler` subsystem
- Reduce `tui-app.ts` by ~120 lines by delegating image concerns
- Maintain identical behavior for all existing scenarios (paste, delete, re-paste, submit, clear)

**Non-Goals:**
- Changing the TUI framework or Editor component
- Changing the clipboard reading mechanism (`readClipboardImageNonBlocking`)
- Altering `ConversationView` draft image rendering
- Adding new paste protocols or image formats
- Modifying `image-pipeline`, `image-cache`, or vision processing

## Decisions

### Decision 1: Single-array ImageManager with `drain()` pattern

**Chosen**: `ImageManager` holds a single `images: ImageContent[]`. Paste calls `add()`. Delete calls `removeLast()`. Submit calls `drain()` which returns all images AND clears the internal array — an atomic capture-and-reset.

```typescript
class ImageManager {
  private images: ImageContent[] = [];
  add(img: ImageContent): void;
  removeLast(): ImageContent | undefined;
  drain(): ImageContent[];   // returns copy, then clears
  get count(): number;
  clear(): void;
}
```

**Alternative A**: Keep dual arrays but wrap them. Rejected — doesn't eliminate the N×M state space.

**Alternative B**: Use a single array with a `locked` flag during submit. Rejected — imperative TUI has no guaranteed unlock point; `drain()` is simpler and more robust.

**Rationale**: `drain()` is the key insight from the autopsy's "core rule 5": synchronize at the point of consumption. By capturing and clearing atomically at submit time, there is no dual-state to keep in sync. The `onChange` handler can freely call `removeLast()` without affecting the submit-time capture because `drain()` happens BEFORE `setText("")` triggers `onChange`.

### Decision 2: ImagePasteHandler as a coordinator, not just a container

**Chosen**: `ImagePasteHandler` owns `ImageManager`, receives clipboard data, calls `imageManager.add()`, inserts `[image]` placeholder in editor, calls `conversationView.addDraftImage()`, and updates `imageStatus`. It is constructed with all dependencies injected.

```typescript
class ImagePasteHandler {
  constructor(
    private imageManager: ImageManager,
    private editor: Editor,
    private conversation: ConversationView,
    private imageStatus: Text,
    private tui: TUI,
  );
  addImage(img: ImageContent): void;
  removeLastImage(): void;
  drainImages(): ImageContent[];
  get imageCount(): number;
  clear(): void;
  updateStatus(): void;
}
```

**Alternative**: Keep all logic in TuiApp with only ImageManager extracted. Rejected — doesn't reduce TuiApp complexity.

**Rationale**: The 4 identical paste-site blocks (Bracketed paste, Kitty protocol, Ctrl+V paste, empty-submit paste) all call the same sequence: `slice → push pendingImages → push imageStore → addDraftImage`. Extracting into a single `addImage()` method eliminates this duplication.

### Decision 3: onChange still calls removeLastImage() directly on ImagePasteHandler

**Chosen**: `onChange` handler calls `imagePasteHandler.removeLastImage()` to pop from the manager AND remove draft blocks from conversation. This is safe because `drain()` happens before `setText("")` in `handleSubmit`.

**Rationale**: The timing in handleSubmit is:
1. `drainImages()` — atomically capture and clear
2. `editor.setText("")` — triggers onChange, which calls `removeLastImage()` on the now-empty manager → no-op
3. Proceed with captured images

This eliminates the need for any `capturingImages` flag or conditional logic in `onChange`.

### Decision 4: ImagePasteHandler does NOT handle clipboard reading

**Chosen**: Clipboard reading (`readClipboardImageNonBlocking`, `extractPrintableText`) remains in `TuiApp.handleInput`. `ImagePasteHandler` receives the already-read `ImageContent`.

**Rationale**: Clipboard reading depends on the paste protocol detection (Bracketed, Kitty, Ctrl+V keybinding) which is tightly coupled to the TUI input handling. Extracting that would require extracting the entire input pipeline, which is out of scope.

### Decision 5: Pre-drain images in input listener before Editor's onChange("")

**Finding**: The `@earendil-works/pi-tui` Editor fires `onChange("")` immediately before `onSubmit` when Enter is pressed (Editor.js line 1020 → line 1022). This means `onChange` sees empty text with pending images and would remove them before `handleSubmit` can capture.

**Chosen**: Intercept Enter/Return in `tui.addInputListener` and call `drainImages()` before the Editor processes the key. The drained images are stored in `drainedSubmitImages`. `onChange` checks this buffer and skips removal when non-null. `handleSubmit` uses the pre-drained images if available, falling back to normal `drainImages()` for programmatic submits (e.g., `/image` command).

**Alternative**: Modify `onChange` to never remove images when text is empty. Rejected — would prevent users from deleting all placeholders to remove all images.

**Rationale**: This is the only reliable way to capture images before the Editor's pre-submit `onChange("")` clears them, since `onChange` fires before `onSubmit` and the two cases (pre-submit vs user deletion) are indistinguishable from `onChange`'s perspective.


## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `drain()` then `setText("")` → onChange → `removeLastImage()` on empty manager is a no-op, but if ordering ever changes, images could be lost | Unit test the handleSubmit sequence explicitly; document the ordering contract |
| `ImagePasteHandler` introduces indirection; debugging image issues now requires tracing through 2 files instead of 1 | Keep ImagePasteHandler ~150 lines with clear method names; add JSDoc |
| Regression: the 6-attempt bug scenarios must not reappear | Create test cases for paste→delete→paste→submit and paste→delete→text→submit before refactoring |
| TypeScript compilation — `ImageManager` and `ImagePasteHandler` are new modules; must export correctly | Both use named exports; barrel export from `src/ui/` not needed |
