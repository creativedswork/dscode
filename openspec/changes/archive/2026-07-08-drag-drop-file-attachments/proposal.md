## Why

Both Web UI and TUI users want to drag files from the OS file manager onto the prompt. The current approach (inserting `@path` text or keeping files in a separate attachment channel) has a discoverability problem: users can't connect their prompt narrative to dropped files. "review this" has no visible link to the three files attached in the bar above.

A better model uses `[file:displayPath]` as a format protocol — visible markers inside the editor that the user can see, type around, and delete naturally. The file tracker and attachment bar complement this by providing a quick overview of attached files and OSC 8 hyperlink click-to-open.

## What Changes

- **File tracker** added as a shared concept: a registry of file paths attached to the current message, synced bidirectionally with `[file:xxx]` markers in the editor via `onChange`
- **Web UI drag-and-drop** reworked: dropping a file registers it in the tracker and shows a chip above the textarea; NO text is inserted (Web UI keeps the chips-only model for now)
- **TUI drag-and-drop** added: dropping a file registers it in the tracker, inserts a `[file:displayPath]` marker at the cursor in the editor, and shows a chip in the attachment bar
- **`[file:xxx]` format protocol**: a plain-text marker (like `[image:N]`) that is both human-readable and machine-parsable. Manually typed `[file:xxx]` markers are also registered in the tracker
- **TUI attachment bar** becomes display-only: shows colored chips for quick scanning, OSC 8 hyperlinks for click-to-open, and `← → scroll · Esc clear all` keybinding hint. No file deletion from the bar — all editing happens in the editor
- **Protocol** extended: `ClientCommand.chat` gains an optional `fileRefs: string[]` field; `[file:xxx]` markers are preserved in the text so the model can see which files are referenced where
- **Resolver** gains a new entry point: `resolveFileRefs(projectPath, fileRefs, limits)` that processes an explicit path array instead of scanning text with regex
- **Path conversion**: absolute paths from drag-and-drop are converted to relative when the file lives inside the project directory
- Existing `@` autocomplete behavior is unchanged — it continues to insert bare relative paths into the editor

## Capabilities

### New Capabilities
- `file-tracker`: A per-message registry of attached file paths, synced bidirectionally with `[file:xxx]` markers in the editor via `onChange`. Files enter via drag-and-drop or manual typing, and are passed as `fileRefs` at submit time.
- `file-marker-protocol`: The `[file:displayPath]` format is a protocol — plain-text, human-readable, machine-parsable via regex `/\[file:([^\]]+)\]/g`. Manually typed markers are recognized and registered in the tracker. Markers are preserved in the submitted text so the model can see which files are referenced where.
- `file-marker-protocol`: The `[file:displayPath]` format is a protocol — plain-text, human-readable, machine-parsable via regex `/\[file:([^\]]+)\]/g`. Manually typed markers are recognized and registered in the tracker. Markers are preserved in the submitted text so the model can see which files are referenced where.

### Modified Capabilities
- `websocket-protocol`: `ClientCommand` for `chat` type SHALL accept an optional `fileRefs: string[]` field
- `at-file-mention`: resolver SHALL provide `resolveFileRefs(projectPath, fileRefs, limits)` that processes an explicit path array instead of scanning text for `@path` patterns

## Impact

- `web/src/components/MessageInput.tsx` — `handleDrop` changed from inserting `@path` text → registering tracker + chip display; `handleSubmit` includes `fileRefs`
- `src/ui/tui-app.ts` — `FileTracker` instance; paste handler detects file drops and inserts `[file:displayPath]` markers; `onChange` syncs marker presence with tracker; display-only attachment bar shows colored chips with OSC 8 hyperlinks; `handleSubmit` keeps markers in text and passes `tracker.drain()` as `fileRefs`
- `src/ui/shared/types.ts` — `FileAttachment` type (may already exist from `web-drag-drop-files` change)
- `src/utils/at-file-resolver.ts` — new `resolveFileRefs()` function that takes an explicit path array
- `src/ui/web/web-backend.ts` — accept and forward `fileRefs` in chat command
- `src/ui/backend.ts` or equivalent TUI backend — forward `fileRefs` to resolver
- WebSocket protocol types — add `fileRefs?: string[]` to chat command
