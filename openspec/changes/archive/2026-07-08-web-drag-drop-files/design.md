## Context

The Web UI currently has no drag-and-drop support. The `MessageInput` component handles image paste via `onPaste` (reading `clipboardData.items`), but no `onDrop`, `onDragOver`, or `onDragEnter` handlers exist. The `@file` autocomplete system provides text-based file browsing, and `at-file-resolver.ts` resolves `@path` references on submit — but the resolver's `safeResolveWithin` rejects any path outside the project directory with a `path_escape` warning.

The help text in `commands.ts` line 186 falsely claims drag-and-drop works, needing correction.

## Goals / Non-Goals

**Goals:**
- Allow dropping files or directories from the OS file manager onto the Web UI prompt input
- Insert the file/directory path as an `@path` reference into the textarea
- Show a visual chip for each dropped file (icon, filename, size, remove button)
- Support dropping multiple files sequentially (each gets its own chip and `@path`)
- Support absolute paths for files outside the project directory
- Use the browser's native `File.type` (MIME) to select the chip icon
- Keep the frontend thin — never read file contents in the browser
- Keep file chip display in sync with textarea: removing `@path` from text removes the chip, and vice versa
- Use relative paths for project files (e.g., `@src/app.ts`) for readability; absolute paths only for external files

**Non-Goals:**
- Image thumbnails for dropped image files (they use `@path` like any other file; image content is handled by `at-file-resolver` on submit)
- File content previews or inline expansion in the input area
- Drag-and-drop in the TUI (not feasible with terminal protocols)
- Upload/copy external files into the project
- Changing the `ClientCommand` WebSocket protocol
- Supporting drag-and-drop into the conversation view (only the input area)
- Changing the path format in TUI (TUI already works with typed paths; this change only affects how Web UI displays drop-inserted paths)

## Decisions

### Decision 1: Frontend never reads file contents

**Rationale:** The `at-file-resolver` already handles file reading with size limits, binary detection, and language inference. Duplicating this logic in the browser would create two sources of truth and potential divergence. The `File` API provides sufficient metadata (name, size, type) for the chip display — no need to read bytes.

**Alternatives considered:**
- Read file contents in browser and send as base64/text: rejected because it duplicates backend logic, adds bandwidth, and requires reimplementing size limits client-side.
- Use `webkitGetAsEntry` for directory traversal: rejected because non-standard and the user explicitly chose "directories insert as-is."

### Decision 2: Insert `@path` on drop, not on submit

**Rationale:** Dropping inserts `@path` immediately into the textarea. This means:
- The user can edit or remove paths before sending
- Multiple drops accumulate naturally (`@file1 @file2`)
- Consistent with the existing `@` autocomplete behavior (which also inserts text)

**Alternatives considered:**
- Accumulate silently and append `@path`s only on submit: rejected because it hides what's being sent and prevents editing.

### Decision 3: `FileAttachment` as a parallel type to `ImageAttachment`

**Rationale:** `ImageAttachment` carries base64 data (frontend reads the file). `FileAttachment` carries only metadata (frontend never reads). They are semantically different and used in different flows. `MessageInput` state holds `FileAttachment[]` separately from `ImageAttachment[]`.

```
FileAttachment {            ImageAttachment {
  name: string;       vs     data: string;   // base64
  size: number;              mimeType: string;
  mimeType: string;        }
  path: string;         // filesystem path (relative for project files, absolute for external)
}
```

**Alternatives considered:**
- Union type (`Attachment = ImageAttachment | FileAttachment`): could work but complicates the `onSend` and `removeImage`/`removeFile` flows in `MessageInput`. Separate state arrays are simpler and don't need protocol changes.

### Decision 4: `safeResolveWithin` relaxed for absolute paths

**Rationale:** The current check ensures paths stay within the project. For absolute paths, the concern is different — we want to confirm the file actually exists. A relaxed check: "if the input path is absolute and the file exists, resolve it."

```typescript
// New behavior in safeResolveWithin:
if (path.isAbsolute(relPath) && existsSync(relPath)) {
  return relPath;  // absolute path to existing file — accept
}
// Fall through to existing project-bound check for relative paths
```

This is the only backend change required.

**Alternatives considered:**
- Copy external files to project temp directory: rejected because it's complex, slow, and changes user expectations about where the file lives.
- Reject all absolute paths: rejected because it blocks the primary use case (dragging files from anywhere in the filesystem).

### Decision 5: File chip icon determined by MIME type prefix

**Rationale:** The browser's `File.type` provides OS-level MIME detection. A simple mapping of MIME prefix → Phosphor icon is sufficient for the chip display:

| MIME prefix | Icon | Phosphor name |
|---|---|---|
| `image/` | 🖼️ | `Image` |
| `text/` | 📄 | `TextAlignLeft` |
| `video/` | 🎬 | `Video` |
| `audio/` | 🎵 | `SpeakerHigh` |
| `application/pdf` | 📕 | `FilePdf` |
| `application/zip`, `application/x-*` | 📦 | `Archive` |
| (default) | 📄 | `File` |

### Decision 6: Relative paths for project files, absolute for external

**Rationale:** When a file is dropped from within the project directory, inserting the absolute path (`@/Users/x/project/src/app.ts`) is noisy and inconsistent with the existing TUI behavior where users type relative paths (`@src/app.ts`). The `handleDrop` handler SHALL compute the display path:
- If the file's absolute path starts with the project directory, strip the project directory prefix and use a relative path (e.g., `src/app.ts`)
- Otherwise, keep the full absolute path (e.g., `/Users/x/Downloads/report.pdf`)

The `FileAttachment.path` field always stores the **absolute** filesystem path (needed by the resolver). The textarea insertion uses the **display** path (relative when possible). This keeps the prompt text readable while preserving resolution correctness.

**Implementation**: `handleDrop` receives the project path as a prop or derives it from the existing context. The function `(file as any).path` gives the absolute path from the File API. Before inserting into the textarea, check if `absolutePath.startsWith(projectPath + "/")` — if so, insert `@relativePath`; otherwise `@absolutePath`.

### Decision 7: Bidirectional chip–text sync via `useEffect`

**Rationale:** The existing `removeFile` function handles chip → text sync (clicking × removes the chip and strips the `@path` from text). But the reverse — user manually deleting `@path` from the textarea — does not remove the chip. This creates a dangling chip with no corresponding text reference.

A `useEffect` watching `text` SHALL sync `files` state: any `FileAttachment` whose `@path` (or display-path variant) no longer appears in the text SHALL be removed from state.

```typescript
useEffect(() => {
  setFiles((prev) =>
    prev.filter((f) => {
      // Check both absolute path and display (relative) path forms
      const escapedAbs = f.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedRel = f.name === f.path ? null : f.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`@${escapedAbs}\\b`).test(text)) return true;
      if (escapedRel && new RegExp(`@${escapedRel}\\b`).test(text)) return true;
      return false;
    }),
  );
}, [text]);
```

**Trade-off**: This adds O(n × m) regex matching on every keystroke, but n (files) is typically ≤ 5 and text length is bounded. The performance impact is negligible.

## Risks / Trade-offs

- **[Risk] Absolute path injection**: A user could type `@/etc/passwd` into the textarea and the resolver would read it. → **Mitigation**: This is the same trust model as typing `@src/config.ts` — the user is sending their own file contents to the LLM. The resolver only reads files, never writes. No new attack surface.
- **[Risk] File chip overflow**: Dropping many files could crowd the input area. → **Mitigation**: The chip area wraps (flex-wrap). Individual chips are capped at ~200px width with text truncation. No hard limit on count; the `at-file-resolver`'s `maxFiles: 5` default applies at submit time.
- **[Risk] Large directory paths**: Dropping `/very/deep/nested/directory/path/` produces a long `@path`. → **Mitigation**: The textarea and chip handle truncation with ellipsis. Path is still correct in the text for the resolver.
- **[Trade-off] No image preview on drop**: Dropping `photo.png` shows a generic file chip, not a thumbnail. → The resolver converts it to an `ImageRef` at submit time, and ChatView renders the thumbnail in the conversation. The input area stays consistent (chips for all dropped files).
- **[Trade-off] useEffect sync on every keystroke**: Running regex on every text change could cause jank with very long text. → **Mitigation**: File count is capped by `maxFiles` (default 5), making the regex loop trivial. If performance issues arise, debouncing with `requestAnimationFrame` or a 100ms delay can be added.

## Open Questions

- **Multi-window drag**: Browsers make it possible to drag files from one browser tab to another. Should we support this? Likely out of scope for v1 — OS file manager is the primary use case.
- **Project path prop**: `MessageInput` currently does not receive the project path. To compute relative paths in `handleDrop`, it needs the project root. Options: pass as a new prop, or read from a context. Leaning toward a `projectPath` prop since it's a simple string and avoids introducing a new context.
