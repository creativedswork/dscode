## 1. Shared data model

- [x] 1.1 Add `FileAttachment` type to `src/ui/shared/types.ts` with fields: `name`, `size`, `mimeType`, `path`
- [x] 1.2 Re-export `FileAttachment` from `web/src/types/index.ts` (verify existing wildcard re-export already covers it)

## 2. Backend: absolute path support

- [x] 2.1 Add `import { isAbsolute } from "node:path"` to `src/utils/at-file-resolver.ts`
- [x] 2.2 Modify `safeResolveWithin` to accept absolute paths that point to existing files (before the existing project-bound check)
- [x] 2.3 Verify: `@/absolute/path/to/file.ts` resolves and `@../../etc/passwd` still rejected

## 3. Web UI: drag-and-drop handlers

- [x] 3.1 Add `onDragOver` handler to `MessageInput` wrapper `<div>` — call `e.preventDefault()` and set `isDragOver` state to true
- [x] 3.2 Add `onDragLeave` handler — set `isDragOver` state to false
- [x] 3.3 Modify `onDrop` handler — extract `File[]` from `e.dataTransfer.files`, build `FileAttachment[]` with absolute paths, compute display path (relative for project files, absolute for external), insert `@displayPath` into textarea, clear `isDragOver`
- [x] 3.4 Guard all handlers: no-op when `processing` is true
- [x] 3.5 Add `files` state (`FileAttachment[]`) to `MessageInput`
- [x] 3.6 Add `projectPath` prop to `MessageInput` (string) — needed to compute relative paths for project files in `handleDrop`

## 4. Web UI: file chips

- [x] 4.1 Create a mapping function `getFileIcon(mimeType: string)` that returns the appropriate Phosphor icon component based on MIME prefix
- [x] 4.2 Render file chips above the textarea (before image thumbnails row, or alongside them in the same flex-wrap container)
- [x] 4.3 Each chip displays: icon, filename (truncated), human-readable size, remove (×) button
- [x] 4.4 Update `removeFile(index)` — removes chip from `files` state and removes corresponding `@path` from text (support both relative and absolute path forms)
- [x] 4.5 Chip styling: `border: 1px solid var(--color-border)`, `border-radius: 8px`, matching the warm design system tokens

## 5. Drag-over visual feedback

- [x] 5.1 Add `isDragOver` state boolean to `MessageInput`
- [x] 5.2 When `isDragOver` is true, apply a border color change or subtle background highlight to the input area wrapper `<div>`

## 6. Cleanup

- [x] 6.1 Correct help text in `src/ui/commands.ts` line 186 — remove the false claim about drag-and-drop existing
- [x] 6.2 Clear `files` state (alongside `images`) in `handleSubmit`
- [x] 6.3 Ensure files are visually cleared on submit and not carried over to the next message
- [x] 6.4 Run `npm run build:web` to verify no build errors
- [x] 6.5 Run `npm run typecheck` to verify no type errors

## 7. Relative path display for project files

- [x] 7.1 In `handleDrop`, after building `FileAttachment` (which always stores absolute path), compute display path: strip `projectPath + "/"` prefix if present, otherwise keep absolute
- [x] 7.2 Insert the display path (not the absolute path) into the textarea via `setText`
- [x] 7.3 Pass `projectPath` to `MessageInput` in `App.tsx`

## 8. Bidirectional chip–text sync

- [x] 8.1 Add `useEffect` in `MessageInput` watching `text` — filter `files` state to remove any `FileAttachment` whose `@path` (in either relative or absolute form) no longer appears in the textarea
- [x] 8.2 Verify: manually deleting `@path` from textarea removes the corresponding chip
- [x] 8.3 Verify: editing `@path` (e.g., changing filename) removes the old chip
- [x] 8.4 Verify: deleting one `@path` when multiple files are present only removes that one chip
