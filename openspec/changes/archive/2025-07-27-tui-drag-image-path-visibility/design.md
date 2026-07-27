## Context

When a user drags an image file into the TUI (Ghostty/macOS), the terminal inserts the absolute file path as bracketed paste text. Current code in `handlePasteImage()` (line 836-846 of `tui-app.ts`) correctly detects this, stores the absolute path in `FileTracker`, and inserts a `[file:<displayName>]` placeholder. At submit time, non-image fileRefs have their absolute paths injected into the prompt (`📁 Attached files:\n- \`/abs/path\``), but **image fileRefs do not** — they are silently consumed by `resolveFileRefs` into base64, with the path discarded.

This means the LLM receives image pixels with no knowledge of their source location. Additionally, the `[file:xxx]` placeholder only shows the filename — the user cannot see the absolute path.

## Goals / Non-Goals

**Goals:**
- Inject image fileRef absolute paths into the prompt at submit time, using the same `📁 Attached files:` format as non-image files
- Show the absolute path when the cursor is on a `[file:xxx]` placeholder (cursor-position-based "hover" since terminals lack mouse hover)

**Non-Goals:**
- No changes to Web UI (Web UI already handles file attachments differently)
- No changes to `FileTracker` public API (reverse lookup can be added without breaking)
- No changes to the bracketed paste detection logic
- No mouse-based hover (terminal limitation)

## Decisions

### D1: Image paths injected alongside base64 content

**Decision**: At submit time (lines 1340-1358), after `resolveFileRefs` reads image content into base64, also inject the absolute paths into the prompt text using the same `📁 Attached files:` format as non-image files.

```
📁 Attached files:
- /Users/.../work-main-ui.png
- /Users/.../screenshot.png
```

This mirrors the existing non-image path injection (lines 1335-1337) and requires only ~4 lines of change.

**Alternatives considered**:
- *Inject paths as image metadata*: The `ImageContent` type doesn't carry a source path, and changing it would cascade across the vision pipeline.
- *Special prompt prefix*: Separate format adds complexity for no benefit. Reusing the existing `📁 Attached files:` format keeps things consistent.

### D2: Cursor-position-based path reveal (no mouse hover)

**Decision**: In the `onChange` handler (line 216), after syncing `[file:xxx]` markers with `FileTracker`, also check `editor.getCursor()` position. If the cursor is within a `[file:xxx]` region, look up the absolute path from `FileTracker` and display it in the attachment bar.

**Rationale**: Terminal UIs don't support mouse hover events. Cursor-position-based detection provides equivalent discoverability — when the user navigates to a file placeholder, the full path appears. The attachment bar (which already shows file chips) is the natural location.

**Implementation sketch**:
```
onChange(text) → 
  cursor = editor.getCursor()
  if cursor.col is inside [file:xxx]:
    displayPath = extract marker at cursor
    absPath = fileTracker.getAbsPath(displayPath)  // new method
    update attachment bar to show absPath as tooltip
```

**Alternatives considered**:
- *Mouse hover via SGR mouse protocol*: Overengineered for this use case. Adds complexity for a niche interaction.
- *Separate status line*: Clutters the UI. Attachment bar is already file-aware.

### D3: FileTracker.getAbsPath() reverse lookup

**Decision**: Add a `getAbsPath(displayPath: string): string | undefined` method to `FileTracker` for reverse lookup from display path to absolute path. The internal `Map<string, string>` already maps `absPath → displayPath`, so reverse lookup requires linear scan or a reverse map.

Since `FileTracker` entries are typically < 10 items, linear scan is acceptable.

**Alternatives considered**:
- *Bidirectional map*: Adds complexity with no real performance benefit at this scale.

## Risks / Trade-offs

- **[Risk] Cursor detection may feel laggy**: `onChange` fires on every keystroke. → **Mitigation**: The cursor scan is O(n) on a small map (< 10 entries), negligible perf cost.
- **[Trade-off] Path injection adds prompt tokens**: Each image path is ~50-100 chars of text. → **Acceptable**: The LLM needs this context to be useful.
