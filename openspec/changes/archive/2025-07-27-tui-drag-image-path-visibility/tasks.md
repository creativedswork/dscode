## Tasks

### 1. Add `FileTracker.getAbsPath()` reverse lookup

- [x] In `src/ui/shared/file-tracker.ts`, add method `getAbsPath(displayPath: string): string | undefined`
- [x] Scan internal `entries` Map for matching display path
- [x] Return absolute path or `undefined`

### 2. Inject image fileRefs paths into prompt at submit time

- [x] In `src/ui/tui-app.ts`, submit handler (around line 1340)
- [x] After `resolveFileRefs` call for imageRefs, inject absolute paths into `text` using the same `📁 Attached files:` format as non-image files
- [x] Merge with non-image path injection so all file paths appear in one block
- [x] Dedup paths already injected via `atPathAbsPaths`

### 3. Reveal absolute path on cursor hover in attachment bar

- [x] In `src/ui/tui-app.ts`, `onChange` handler (around line 234)
- [x] After syncing `[file:xxx]` markers, call `editor.getCursor()` to get cursor position
- [x] Check if cursor line/col falls within any `[file:xxx]` region in the editor text
- [x] If yes: call `fileTracker.getAbsPath(displayPath)` and show absolute path in attachment bar
- [x] If no: revert attachment bar to display-only mode
- [x] Call `updateAttachmentBar()` to refresh

### 4. Verify

- [ ] Drag an image file from Finder into Ghostty TUI
- [ ] Confirm `[file:<name>]` placeholder appears
- [ ] Confirm cursor on placeholder shows absolute path in attachment bar
- [ ] Submit → confirm LLM receives `📁 Attached files:\n- \`/abs/path\`` in prompt
- [ ] Test with multiple files (mix of image and non-image)
- [ ] Test with no files (no regression)
