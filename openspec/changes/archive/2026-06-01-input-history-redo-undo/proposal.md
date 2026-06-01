## Why

Users frequently resubmit, edit, or reference previously typed inputs, but the current input area (both web and TUI) has no memory of past submissions — after sending a message, the input is cleared and the history is lost. Adding up/down arrow key navigation through input history is a standard REPL/terminal interaction pattern that dramatically improves workflow efficiency for power users.

## What Changes

- **Web (`MessageInput`)**: Add an **in-memory input history buffer** that records each submitted text (non-empty, non-duplicate with the most recent entry). Extend `handleKeyDown` to intercept ArrowUp/ArrowDown when no popover menu is open.
  - **ArrowUp**: Recall the previous history entry. If already at the oldest, stay there.
  - **ArrowDown**: Recall the next entry. If past the newest, restore the user's draft.
  - Resets history pointer when user types away from a recalled entry.
- **TUI (`TuiApp`)**: Call `this.editor.addToHistory(text)` in `handleSubmit` before clearing the editor. The pi-tui `Editor` already handles ArrowUp/ArrowDown history navigation natively — we just need to populate the history buffer.
- History is **session-scoped** — lost on page refresh or process restart. No persistence.

## Capabilities

### New Capabilities

- `input-history`: Tracks submitted input text in a ring buffer (web) and populates the pi-tui Editor history (TUI), navigable via ArrowUp/ArrowDown keys.

### Modified Capabilities

- `web-frontend`: The Input area requirement gains scenarios for input history keyboard navigation.

## Impact

- **Web**: `web/src/components/MessageInput.tsx` — add history state, extend `handleKeyDown`, draft-save/reset in `handleChange`.
- **TUI**: `src/ui/tui-app.ts` — single `this.editor.addToHistory(text)` call in `handleSubmit`.
- **No API changes**: Purely client-side UX enhancement.
- **No dependency changes**: pi-tui already supports `addToHistory` on its `Editor` component.
