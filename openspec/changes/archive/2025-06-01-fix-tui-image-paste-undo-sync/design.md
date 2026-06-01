## Context

In the TUI, when a user pastes an image into the prompt editor (before submitting), `TuiApp` immediately:

1. Pushes the image to `pendingImages[]`
2. Inserts `[image]` placeholder text into the editor
3. Renders the image in the conversation area via `ConversationView.addInlineImage()`
4. Adds an info line via `ConversationView.addInfo()`

When the user backspaces the `[image]` placeholder from the editor, the conversation draft blocks are not removed — they remain visible and the stale images are still sent to the model on submit.

### Current data flow

```
TuiApp                              ConversationView
──────                              ────────────────
pendingImages: [img]                blocks: [...userText, text:[image:/path], image:img, text:"Image pasted..."]
editor text: "hello [image] "      renderedBlockCount: N+3
imageStatus: "1 image(s) attached"  box.children: [...children for each block]
```

The invariant is: `count of [image] in editor === pendingImages.length === count of draft image groups in conversation`.

The gap is in `editor.onChange` — it only checks for large paste patterns, never for `[image]` count changes.

### Constraints

- `ConversationView.render()` maps each block 1:1 to a `box.addChild(component)` call
- `box.removeChild(component)` exists and is used in `renderLive()` and `clear()`
- `addInlineImage()` adds 1 text block always + 0-1 image block conditionally (non-JPEG)
- `addInfo()` for paste adds 1 additional text block
- Multiple images can be pasted sequentially before submit — each creates its own group

## Goals / Non-Goals

**Goals:**
- When user deletes `[image]` from the editor, the corresponding draft image group disappears from the conversation view
- `pendingImages[]` stays in sync with editor `[image]` count
- `imageStatus` (status bar) updates correctly
- All three paste entry points covered: bracketed paste, Kitty protocol, and Cmd+V shortcut
- Multiple sequential image pastes and partial backspaces work correctly (e.g., paste 3 images, delete 1)

**Non-Goals:**
- Undoing already-submitted images from the conversation history (this is about draft-only)
- Web UI image paste behavior
- Changing image caching or session storage

## Decisions

### D1: Consolidate `addInlineImage` + `addInfo` into single method

**Decision:** Add `addDraftImage(base64Data, mimeType, infoText)` to `ConversationView` that combines the file save, text block, optional image block, and info block into one atomic operation. It records the total block count on a `draftImageBlockCounts: number[]` stack.

**Alternatives considered:**
- **A) Return block count from `addInlineImage`, separately track `addInfo`**: Fragile coupling — every paste site must remember to call both in order and sum the counts. Easy to break.
- **B) Have `TuiApp` pass block counts to a "remove N blocks" method**: Breaks encapsulation — `TuiApp` shouldn't know how many blocks an image paste creates.

**Rationale for D1:** The three paste sites in `TuiApp` all follow the same pattern: `addInlineImage` + `addInfo`. Consolidating into one method reduces duplication and makes the group tracking automatic.

### D2: LIFO block removal via `removeLastDraftImage()`

**Decision:** `removeLastDraftImage()` pops the last entry from `draftImageBlockCounts[]`, removes that many blocks from `this.blocks[]` via `splice(-count)`, removes the corresponding `box.children` via `removeChild()`, and decrements `renderedBlockCount`.

**Alternatives considered:**
- **A) Clear entire conversation and replay**: Heavyweight — loses all scrollback context. Not viable.
- **B) Tag each block with a group ID, filter on removal**: Over-engineered for a strictly LIFO requirement (images are always removed in reverse paste order).

**Rationale for D2:** Image removal from the editor is inherently LIFO — the user backspaces right-to-left. The stack naturally mirrors this.

### D3: `editor.onChange` as the sync trigger

**Decision:** Extend the existing `editor.onChange` callback to count `[image]` occurrences and synchronize `pendingImages[]` + conversation draft groups when a mismatch is detected.

```
editor text [image] count < pendingImages.length  →  user deleted placeholder(s)
editor text [image] count > pendingImages.length  →  shouldn't happen in normal flow, but resilient no-op
```

**Alternatives considered:**
- **A) Listen for backspace/delete key events specifically**: Too fine-grained — misses multi-char deletes, selection-delete, Cmd+Z, etc.
- **B) Poll editor content**: Unnecessary complexity; the editor already fires `onChange` on every content change.

**Rationale for D3:** `onChange` is the natural hook — it fires on every text mutation regardless of input method. Counting `[image]` occurrences is O(n) where n is tiny (editor text is short).

## Risks / Trade-offs

- **[Risk] JPEG images add fewer blocks (no image block) than PNG:** → Mitigated by D1 — `addDraftImage` computes the actual block count, not a hardcoded constant.
- **[Risk] `liveComponents` and `renderPermPrompt` children are mixed with draft image block children in `box.children`:** → Since removal only pops from the tail, and draft image groups are always the last blocks added to the conversation (there's no other block-adding activity while the user is editing the prompt), tail removal is safe.
- **[Risk] If the editor's `[image]` text is manually typed (not pasted), the count would mismatch:** → The `[image]` string is just plain text; if typed manually, no `pendingImages` entry exists. `count > pendingImages.length` is handled as a no-op. No false removal.
- **[Risk] Cmd+Z (undo) in the editor might not fire `onChange` consistently across terminals:** → This is a pre-existing limitation of terminal input handling, not introduced by this change. The sync will fire on the next content change event.

## Open Questions

<!-- None at this stage -->
