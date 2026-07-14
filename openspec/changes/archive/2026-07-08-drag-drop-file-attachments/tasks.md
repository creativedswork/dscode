## 1. Shared Infrastructure

- [x] 1.1 Create `FileTracker` class in `src/ui/shared/file-tracker.ts` with `add`, `remove`, `getAll`, `getDisplayPaths`, `clear`, `drain`, `count`
- [x] 1.2 Add `resolveFileRefs(projectPath, fileRefs, limits?)` to `src/utils/at-file-resolver.ts`, sharing internal file-reading helpers with `resolveAtFileRefs`
- [x] 1.3 Add `fileRefs?: string[]` to `ClientCommand` chat type in `src/ui/shared/types.ts`

## 2. Web UI — Rework handleDrop

- [x] 2.1 Replace `handleDrop` text-insertion logic: call `tracker.add()` for each dropped file, update chip state from tracker
- [x] 2.2 Remove the bidirectional chip–text `useEffect` sync (files are no longer in text)
- [x] 2.3 Ensure chip removal calls `tracker.remove()` and updates chip state
- [x] 2.4 Update `handleSubmit` to pass `tracker.drain()` as `fileRefs` in the WebSocket chat command
- [x] 2.5 File chips display `tracker.getDisplayPaths()` (relative when in project) instead of raw `(file as any).path`

## 3. TUI — Drag-and-Drop Detection

- [x] 3.1 Add `FileTracker` instance to `TuiApp`, instantiate in constructor with project path
- [x] 3.2 Add file-drop detection in the `handlePasteImage` / input listener: when bracketed paste content is a single absolute path to an existing file, register in tracker and return `{ consume: true }`
- [x] 3.3 Add attachment bar component (extend `imageStatus`) to show file chips with filenames from `tracker.getDisplayPaths()`

## 4. TUI — `[file:xxx]` Editor Integration

- [x] 4.1 After file-drop detection: call `tracker.add(absPath, projectPath)` then `editor.insertTextAtCursor("[file:" + displayPath + "] ")`
- [x] 4.2 Update `handleSubmit` to call `tracker.drain()` and pass fileRefs alongside text and images
- [x] 4.3 Ensure tracker is cleared on message submit

## 5. Backend Integration

- [x] 5.1 Update `web/web-backend.ts` chat handler: if `fileRefs` is present and non-empty, call `resolveFileRefs()` and merge results with any text-based `@path` resolution
- [x] 5.2 Update TUI `handleSubmit`: call `resolveFileRefs()` for tracker paths before `agent.prompt()`
- [x] 5.3 Ensure fileRefs resolution uses the same `AtFileLimits` config as text-based resolution

## 6. Cleanup & Polish

- [x] 6.1 Remove any stale `@path` insertion code from Web UI `handleDrop` (if applicable)
- [x] 6.2 Update help text in `commands.ts` if it references drag-and-drop behavior
- [ ] 6.3 Manual test: Web UI — drag single file, verify chip appears, editor unchanged, submit works
- [ ] 6.4 Manual test: TUI — drag single file, verify `[file:xxx]` marker appears in editor, attachment bar shows chip, submit works

## 7. TUI — Attachment Bar (display-only)

- [x] 7.1 Render filenames from `tracker.getDisplayPaths()` as `c.bgBlue` chips, with `hyperlink(text, 'file://' + absPath)` for OSC 8 clickability
- [x] 7.2 Unify image + file display in one row: show `🖼 N images` chip alongside `📎 file chips`
- [x] 7.3 Add `c.dim` hint line below chips: `← → scroll · Esc clear all`
- [x] 7.4 Implement horizontal scroll: track `scrollOffset` for chips exceeding terminal width, ← → pans the chip row (no selection highlight needed)
- [x] 7.5 Simplify: remove `attachmentSelection` index and Backspace deletion from `handleInput` — Backspace always goes to Editor
- [x] 7.6 Esc: clear tracker AND strip `[file:xxx]` markers from editor text via regex replace
- [x] 7.7 Bar height zero when tracker and image handler are both empty

## 8. TUI — `[file:xxx]` onChange Bidirectional Sync

- [x] 8.1 Add `[file:xxx]` regex extraction in `onChange`: `/\[file:([^\]]+)\]/g` to get presentPaths
- [x] 8.2 Implement sync logic: added paths → `tracker.add()` (resolve abs path from display path); removed paths → `tracker.remove()` (match by abs path)
- [x] 8.3 Call `updateAttachmentBar()` after sync to reflect changes in chip display
- [x] 8.4 Handle `[file:xxx]` markers typed manually: when displayPath resolves to an existing file, register it; non-existent paths are ignored
- [x] 8.5 Deduplicate: if a path is already in tracker (by abs path), don't add again
- [x] 8.6 Strip `[file:xxx]` placeholders from text for image placeholder sync (avoid conflict with `[image:N]` removal)

## 9. Submit & Resolver Updates

- [x] 9.1 TUI `handleSubmit`: keep `[file:xxx]` markers in text (don't strip them), pass `tracker.drain()` as `fileRefs`
- [x] 9.2 Merge fileRefs-resolved content with any text-based `@path` resolution (existing `resolveAtFileRefs` handles text `@path`, `resolveFileRefs` handles `fileRefs`)
- [x] 9.3 Ensure `[file:xxx]` markers don't duplicate file content if same file is referenced via both `@path` in text and `fileRefs`
- [ ] 9.4 Manual test: drop file → verify `[file:xxx]` appears in editor, attachment bar updates, submit sends both text marker and fileRefs