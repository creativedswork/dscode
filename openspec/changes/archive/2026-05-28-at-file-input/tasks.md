## 1. Shared at-file resolver

- [x] 1.1 Create `src/utils/at-file-resolver.ts` with `resolveAtFileRefs(projectPath, text, limits)` function
- [x] 1.2 Implement `@path` regex detection to extract all `@relative/path` references from message text
- [x] 1.3 Implement file reading with text/binary detection (skip binary files based on extension and null-byte check)
- [x] 1.4 Implement size limit enforcement (max file size, max files, max total content) with truncation markers
- [x] 1.5 Implement markdown code block rendering with language tag inference from file extension
- [x] 1.6 Implement file listing function `listProjectFiles(projectPath, prefix)` for autocomplete use (reuses glob/fd logic)

## 2. TUI resolution integration

- [x] 2.1 Wire `resolveAtFileRefs` into `TuiApp.handleSubmit` before text reaches `agent.prompt()`
- [x] 2.2 Display warnings from resolution (file not found, truncated, skipped) via `conversation.addInfo`
- [x] 2.3 Verify TUI `@` autocomplete already works with `CombinedAutocompleteProvider` (no code changes needed, just confirm)

## 3. Web protocol extension

- [x] 3.1 Add `file_list` command type to `ClientCommand` in `src/ui/web/protocol.ts`
- [x] 3.2 Add `file_list_result` event type to `ServerEvent` in `src/ui/web/protocol.ts`
- [x] 3.3 Mirror new types in `web/src/types/index.ts`

## 4. Web server-side handling

- [x] 4.1 Handle `file_list` client command in `src/ui/web/web-backend.ts`: call `listProjectFiles` and respond with `file_list_result`
- [x] 4.2 Wire `resolveAtFileRefs` into the `chat` command handler in `src/ui/web/web-backend.ts` before passing to agent
- [x] 4.3 Forward resolution warnings back to client as `info` or `error` events

## 5. Web UI @file autocomplete

- [x] 5.1 Add `@` detection in `MessageInput.handleChange`: when user types `@`, extract prefix after `@` and enter file-autocomplete mode
- [x] 5.2 Send debounced `file_list` WebSocket commands (150ms debounce) as user types after `@`
- [x] 5.3 Render file autocomplete dropdown UI (similar to slash command dropdown but for files)
- [x] 5.4 Implement keyboard navigation (ArrowUp/Down, Enter, Escape, Tab) for file dropdown
- [x] 5.5 Implement mouse selection (click to select file from dropdown)
- [x] 5.6 Handle empty results ("No matching files" message)
- [x] 5.7 Close file dropdown when cursor leaves `@` context (user deletes the `@` or moves past the file path)
- [x] 5.8 Handle `file_list_result` events in `useWebSocket` handler to update dropdown items

## 6. Configuration

- [x] 6.1 Add `atFileMaxFiles`, `atFileMaxFileSize`, `atFileMaxTotalSize` to settings types and defaults
- [x] 6.2 Read at-file limits from settings in both TUI and web server paths
- [x] 6.3 Document new settings in `/config help` output or user-visible settings
