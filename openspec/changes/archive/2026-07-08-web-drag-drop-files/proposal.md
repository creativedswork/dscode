## Why

Web UI users currently have two ways to reference files in a message: typing `@` followed by a path in the autocomplete, or pasting images from the clipboard. Dragging a file from the OS file manager — the most direct and intuitive method — does nothing. The help text even claims it works ("In Web UI: drag & drop, paste, or click to upload images"), which is misleading. This gap makes the Web UI feel less capable than it should, especially when compared to other AI coding tools that accept drag-and-drop natively.

## What Changes

- **Web UI prompt input** gains drag-and-drop support: users can drag files or directories from their OS file manager onto the input area, and the path is inserted as an `@` reference into the text
- **`FileAttachment` type** added to the shared UI data model to represent a dropped file's metadata (name, size, MIME type, absolute path) without reading file contents in the browser
- **File chips** rendered in the input area above the textarea, showing an icon, filename, size, and a remove button — one chip per dropped file
- **Absolute path support** added to `at-file-resolver`: files outside the project directory can be referenced by absolute path (e.g., `@/Users/x/Documents/report.pdf`)
- **Directory drop** inserts the directory path as-is (no recursive expansion); the resolver treats it as a path reference
- **Help text corrected** in `commands.ts` to match actual capabilities
- **Bidirectional chip–text sync**: when the user manually deletes an `@path` from the textarea, the corresponding file chip is automatically removed (and vice versa)
- **Path display consistency**: file paths inserted by drag-and-drop SHALL use relative paths when the file is inside the project directory, matching the existing TUI `@file` behavior where users type relative paths

## Capabilities

### New Capabilities
- `web-drag-drop-files`: Drag-and-drop file input in the Web UI prompt, with file metadata chips and `@path` insertion, bidirectional chip–text sync, and relative-path display for project files

### Modified Capabilities
- `at-file-mention`: `safeResolveWithin` SHALL accept absolute paths that point to existing files, not just paths within the project directory

## Impact

- `web/src/components/MessageInput.tsx` — new `onDrop`, `onDragOver`, `onDragEnter` handlers; new `files` state; FileChip render; bidirectional text–chip sync via `useEffect`; relative-path computation in `handleDrop`
- `src/ui/shared/types.ts` — new `FileAttachment` type
- `src/utils/at-file-resolver.ts` — relaxed `safeResolveWithin` for absolute paths
- `src/ui/commands.ts` — corrected help text (line 186)
- `web/src/types/index.ts` — re-export `FileAttachment` if needed (already re-exports from shared)
- **Help text corrected** in `commands.ts` to match actual capabilities

## Capabilities

### New Capabilities
- `web-drag-drop-files`: Drag-and-drop file input in the Web UI prompt, with file metadata chips and `@path` insertion

### Modified Capabilities
- `at-file-mention`: `safeResolveWithin` SHALL accept absolute paths that point to existing files, not just paths within the project directory

## Impact

- `web/src/components/MessageInput.tsx` — new `onDrop`, `onDragOver`, `onDragEnter` handlers; new `files` state; FileChip render
- `src/ui/shared/types.ts` — new `FileAttachment` type
- `src/utils/at-file-resolver.ts` — relaxed `safeResolveWithin` for absolute paths
- `src/ui/commands.ts` — corrected help text (line 186)
- `web/src/types/index.ts` — re-export `FileAttachment` if needed (already re-exports from shared)
