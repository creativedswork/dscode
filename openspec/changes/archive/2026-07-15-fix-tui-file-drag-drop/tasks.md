## 1. Bug: remove duplicate fileRefs split block in web-backend.ts

- [ ] 1.1 In `src/ui/web/web-backend.ts`, remove the duplicate `fileRefs` split block at lines ~567-595 (identical to the correct block at lines ~538-566), which causes non-image paths to be injected twice into prompt text

## 2. Config-driven file size limits (replace hardcoded 50KB)

- [ ] 2.1 In `src/ui/shared/types.ts`, add `maxFileSize` and `maxTotalSize` to `ConfigData` type
- [ ] 2.2 In web backend `buildConfigData()`, include `maxFileSize` / `maxTotalSize` from `atFile` config (defaults: 10MB / 50MB)
- [ ] 2.3 In `App.tsx`, pass `config` prop to `MessageInput`
- [ ] 2.4 In `MessageInput.tsx`, remove hardcoded `MAX_FILE_SIZE` and `MAX_TOTAL_SIZE` constants, read from `config` prop
- [ ] 2.5 Size limits only apply to non-image, non-project-match files (external files via upload-to-temp)
- [ ] 2.6 When a file is skipped due to size, show warning toast: "Skipped filename.ext (exceeds X MB limit)"
- [ ] 2.7 When multiple files are skipped, show: "Skipped N files (exceeds size limit)"

## 3. Project file matching: inject @path instead of reading content

- [ ] 3.1 In `src/ui/shared/types.ts`, add `file_search` ClientCommand and `file_search_result` ServerEvent
- [ ] 3.2 Server-side: in `web-backend.ts`, handle `file_search` command — search project files by exact filename, return paths
- [ ] 3.3 In `App.tsx`, wire `file_search` command/event between MessageInput and WebSocket
- [ ] 3.4 In `MessageInput.tsx` `handleDrop`, for non-image files, call `file_search` before reading content:
  - 1 match → inject `@path` directly into input text (zero-transport)
  - N matches → show file picker (reuse existing `showFileMenu`), user selects → inject `@path`
  - 0 matches → fall through to existing upload-to-temp flow
- [ ] 3.5 Ensure project-matched files skip both size check and content read

## 4. Settings panel: upload cache management

- [ ] 4.1 In `src/ui/shared/types.ts`, add `upload_stats` ServerEvent and `clear_uploads` ClientCommand
- [ ] 4.2 Server: on `ready` event, scan `.dscode/uploads/` and send `{ type: "upload_stats", files: N, bytes: M }`
- [ ] 4.3 Server: handle `clear_uploads` command — delete `.dscode/uploads/` recursively, return stats
- [ ] 4.4 In `App.tsx`, handle `upload_stats` event — store in state, pass to Sidebar
- [ ] 4.5 In `SettingsPanel` (Sidebar.tsx), add "Upload Cache" section with stats display and "Clear Upload Cache" button
- [ ] 4.6 On clear success → toast: "Cleared N files (X MB)" and update stats to 0
- [ ] 4.7 On clear when empty → toast: "No cached files to clear"

## 5. TypeScript and manual test

- [ ] 5.1 Run `npm run typecheck`
- [ ] 5.2 Manual test (TUI): drag a `.ts` file, verify path ref without content
- [ ] 5.3 Manual test (TUI): drag a `.png` file, verify ImagePipeline
- [ ] 5.4 Manual test (TUI): drag both `.ts` and `.png`, verify mixed behavior
- [ ] 5.5 Manual test (Web): drag a `.json` file, verify temp path + agent can read_file
- [ ] 5.6 Manual test (Web): drag a `.png` file, verify ImagePipeline
- [ ] 5.7 Manual test (Web): drag both `.json` and `.png`, verify mixed behavior
- [ ] 5.8 Manual test (Web): verify temp files cleaned up after session end
- [ ] 5.9 Manual test: drag project file `package.json` → injected as @package.json
- [ ] 5.10 Manual test: drag file with ambiguous name → picker shown
- [ ] 5.11 Manual test: drag external PDF <10MB → uploaded to temp
- [ ] 5.12 Manual test: drag external file >10MB → toast warning + skip
- [ ] 5.13 Manual test: Settings → Clear Upload Cache → toast + stats update
- [ ] 5.14 Manual test: Settings → Clear when empty → "No cached files" toast
