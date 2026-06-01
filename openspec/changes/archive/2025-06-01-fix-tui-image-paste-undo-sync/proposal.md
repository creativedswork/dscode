## Why

When a user pastes an image into the TUI prompt box, the system immediately renders it in the conversation area as a draft preview (link + inline render + info text). If the user then backspaces the `[image]` placeholder from the prompt editor, the conversation area does not synchronize — the draft image blocks remain visible and the stale images are still sent to the model on submit. The prompt editor and the conversation must stay in lockstep for draft content.

## What Changes

- `ConversationView` gains the ability to remove draft image groups (the blocks added by `addInlineImage` + `addInfo` for a single image paste) in LIFO order
- `TuiApp.editor.onChange` monitors the count of `[image]` placeholders in the editor text and synchronizes `pendingImages[]` and the conversation draft blocks when a mismatch is detected
- Status bar (`imageStatus`) correctly reflects the current state after placeholder removal

## Capabilities

### New Capabilities
- `tui-draft-image-sync`: bidirectional synchronization between prompt-editor image placeholders and conversation view draft image blocks

### Modified Capabilities
<!-- No existing capabilities have spec-level requirement changes -->

## Impact

- `src/ui/conversation.ts` — new method `removeLastPendingImageGroup()` to pop the blocks associated with a single image paste
- `src/ui/tui-app.ts` — `onChange` callback extended to detect `[image]` count changes and trigger sync
