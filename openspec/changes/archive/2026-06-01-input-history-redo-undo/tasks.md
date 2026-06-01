## 1. Add history state to MessageInput (Web)

- [x] 1.1 Add `historyRef` (useRef<string[]>) for the ring buffer, `historyCursorRef` (useRef<number>) initialized to -1, and `draftRef` (useRef<string>) for draft preservation
- [x] 1.2 Add `MAX_HISTORY` constant set to 100

## 2. Push submitted text to history (Web)

- [x] 2.1 In `handleSubmit`, before clearing `text`, push the trimmed text to `historyRef.current` if non-empty and not identical to the last entry (`historyRef.current[0]`)
- [x] 2.2 Enforce the 100-entry cap by shifting the oldest entries when the limit is exceeded
- [x] 2.3 Reset `historyCursorRef.current` to -1 after each submit

## 3. Extend handleKeyDown for history navigation (Web)

- [x] 3.1 After the existing `showFileMenu` and `showSlashMenu` guard blocks and before the `Escape`/processing check, add a new block for `ArrowUp` when `!processing && historyRef.current.length > 0`
- [x] 3.2 On first ArrowUp press (cursor at -1): save current `text` to `draftRef.current`, set cursor to 0 (newest entry), and `setText(historyRef.current[0])`
- [x] 3.3 On subsequent ArrowUp presses: increment cursor (clamped to `historyRef.current.length - 1`) and `setText` the corresponding entry
- [x] 3.4 Add a block for `ArrowDown` when cursor >= 0: decrement cursor; if cursor becomes -1, restore `draftRef.current`; otherwise `setText(historyRef.current[cursor])`
- [x] 3.5 Move cursor to end of textarea after each history navigation via `requestAnimationFrame` + `setSelectionRange`

## 4. Reset history cursor on user edits (Web)

- [x] 4.1 In `handleChange`, set `historyCursorRef.current = -1` and `draftRef.current = ""` at the top, before any slash/file menu logic
- [x] 4.2 Ensure the reset only happens when the user actively edits (the `onChange` handler already covers this — just add the ref reset)

## 5. TUI: Populate pi-tui Editor history

- [x] 5.1 In `src/ui/tui-app.ts` `handleSubmit`, call `this.editor.addToHistory(text)` before `this.editor.setText("")`
- [x] 5.2 Ensure `addToHistory` is called for all non-empty text submissions (including slash commands, normal chat, and @file-resolved text)

## 6. Verify and test

- [x] 6.1 Typecheck: run `npm run typecheck` and verify no errors
- [x] 6.2 Build frontend: run `npm run build:web` and verify no errors
- [ ] 6.3 Manually test web flow: type → submit → ArrowUp recalls → ArrowDown restores draft → type to reset → ArrowUp starts from newest again
- [ ] 6.4 Manually test TUI flow: type → submit → ArrowUp recalls → ArrowDown navigates forward → history available after multiple submissions
- [ ] 6.5 Test web edge cases: empty history, duplicate suppression, 100+ entry ring buffer, multi-line entries, processing state (input disabled)
- [ ] 6.6 Test TUI edge cases: empty submit not recorded, history available after session commands
