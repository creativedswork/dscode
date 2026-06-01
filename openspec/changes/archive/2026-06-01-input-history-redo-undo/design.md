## Context

**Web**: The `MessageInput` component (`web/src/components/MessageInput.tsx`) is a controlled React component wrapping a `<textarea>`. Text is managed via `useState("")` and cleared on submit. The `handleKeyDown` handler already intercepts ArrowUp/ArrowDown for slash-command and file-picker popover navigation. No input history mechanism exists — submitted text is lost immediately after clearing.

**TUI**: The `TuiApp` class (`src/ui/tui-app.ts`) uses the pi-tui `Editor` component for text input. The `Editor` has a built-in `addToHistory(text: string)` method and native ArrowUp/ArrowDown history navigation — but `addToHistory` is never called in `handleSubmit`, so the history buffer remains empty.

This change adds standard REPL-style input history to both surfaces. The web side requires a custom implementation; the TUI side only needs a single `addToHistory` call.

## Goals / Non-Goals

**Goals:**
- **Web**: Record each submitted non-empty text in an in-memory ring buffer (cap at 100 entries). Allow ArrowUp/ArrowDown to navigate backward/forward through history when no popover is open. Preserve the user's draft text. Reset cursor on edits. Deduplicate consecutive identical entries.
- **TUI**: Call `this.editor.addToHistory(text)` on submit so the pi-tui Editor's native history navigation (ArrowUp/ArrowDown) works.

**Non-Goals:**
- Persist history across sessions (no localStorage, no server storage).
- History for slash commands or file paths specifically — we track the raw textarea content.
- Multi-line history entries treated differently — any submitted text is one entry.

## Decisions

### Web Decisions

#### 1. History stored in `useRef` not `useState`

**Rationale:** The history array and cursor position don't directly drive render output — only the `text` state does. Using refs avoids unnecessary re-renders when pushing to history or moving the cursor. The `text` setter is called explicitly when navigating.

**Alternative considered:** `useState` for history — rejected because every history push would trigger a render even though the textarea content hasn't changed.

#### 2. Draft saved in `useRef`, not derived from `text` state

**Rationale:** When the user arrows up into history, we need to remember what they had typed before navigating so ArrowDown past the newest entry restores it. Storing this in a ref avoids race conditions with React's batched state updates.

#### 3. Reset on any text change (not just cursor movement)

**Rationale:** In `handleChange`, when the user modifies text, we reset `historyCursorRef` to `-1` (meaning "not navigating"). This means the next ArrowUp always starts from the newest entry. This matches terminal REPL behavior (bash, zsh, python) where typing after recalling history resets the navigation position.

#### 4. ArrowDown from newest position clears to draft

**Rationale:** When `historyCursorRef` is at 0 (newest entry) and ArrowDown is pressed, we move to -1 and restore `draftRef`. This mimics bash behavior where down-arrow past the newest entry returns to the current (possibly empty) input line.

#### 5. Max 100 entries, ring buffer

**Rationale:** Prevents unbounded memory growth for long sessions. 100 is generous — most terminal shells default to 500-1000 but we're in a browser context where memory is more constrained.

#### 6. No history when popover menus are open

**Rationale:** ArrowUp/ArrowDown already have meaning in slash-command and file-picker menus. History navigation only activates when `!showSlashMenu && !showFileMenu`. This check happens early in `handleKeyDown`, before the existing menu handlers, so there's no conflict.

### TUI Decisions

#### 7. Delegate to pi-tui Editor's native history

**Rationale:** The pi-tui `Editor` already implements ArrowUp/ArrowDown history navigation, deduplication, and cursor management. We simply call `this.editor.addToHistory(text)` in `handleSubmit` before `this.editor.setText("")`. No custom implementation needed.

**Alternative considered:** Building custom history in `TuiApp` — rejected because it would duplicate logic the Editor already handles correctly, including edge cases around cursor position and multi-line entries.

## Risks / Trade-offs

- **[Risk] User accidentally overwrites draft** (web): If a user arrows up into history and then starts typing, the draft is lost. → **Mitigation**: Standard REPL behavior; users expect it.
- **[Risk] Large history entries consume memory** (web): Multi-line code snippets could be large. → **Mitigation**: 100-entry cap keeps worst-case under ~1MB.
- **[Risk] TUI Editor history cap unknown**: pi-tui's internal history buffer size is not configurable from our side. → **Mitigation**: Accept pi-tui's default; we can contribute upstream if needed.
