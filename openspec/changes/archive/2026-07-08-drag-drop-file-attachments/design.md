## Context

The Web UI currently handles file drag-and-drop by inserting `@path` text into the textarea. The TUI has no drag-and-drop support at all. Both sides share `resolveAtFileRefs()` which scans message text with regex `/@([^\s@]+)/g` to extract file references.

The existing `@` autocomplete system (triggered by typing `@` in the editor) is unchanged by this design — it continues inserting bare relative paths into the editor. This design only covers the drag-and-drop entry point and the shared tracker/resolver infrastructure.

## Goals / Non-Goals

**Goals:**
- Add drag-and-drop file attachment to both Web UI and TUI
- Files enter via drag-and-drop → registered in a tracker → passed as `fileRefs` array at submit
- Editor text includes `[file:displayPath]` markers inserted by drag-and-drop, forming a visible protocol between user and model
- File paths from drag-and-drop are converted from absolute to relative when within the project directory
- Provide visual feedback: Web UI shows file chips, TUI shows a status line count
- `resolveFileRefs()` provides an API that takes an explicit path array (not regex scanning)

**Non-Goals:**
- Changing the `@` autocomplete system
- Removing or deprecating the existing `@path` regex-based resolver (it stays as backward-compatible path)
- Image content previews for dragged files in the TUI (v1 limitation — images are resolved at submit time like other files)
- Multi-file drag-and-drop in TUI (v1: single file only, due to terminal protocol ambiguity with spaces in paths)
- File content reading at drag time (all reading happens at submit, consistent with Web UI architecture)

## Decisions

### Decision 1: FileTracker as a standalone class in `src/ui/shared/`

**Rationale:** Both Web UI and TUI need the same core logic: register a file path, check if it's within the project, convert to relative, deduplicate, remove, drain. A shared class avoids duplication and keeps the resolver's text-scanning logic completely separate.

```typescript
class FileTracker {
  private entries: Map<string, string>;  // displayPath → absolutePath

  add(absPath: string, projectPath: string): string;
  // Returns display path. Converts to relative if within project.
  // No-ops if path already registered.

  remove(absPath: string): void;
  getAll(): string[];        // Returns absolute paths for resolver
  getDisplayPaths(): string[]; // Returns display paths for UI
  clear(): void;
  get count(): number;
  drain(): string[];         // Atomically get and clear
}
```

**Alternatives considered:**
- Inline state in each UI component: rejected because it duplicates path-conversion logic.
- Extend `resolveAtFileRefs` to manage its own state: rejected because the tracker is UI-layer state (it survives between keystrokes but not between messages), while the resolver is a stateless function.

### Decision 2: `[file:displayPath]` markers in editor text, fileRefs as transport

**Rationale:** Drag-and-drop inserts `[file:displayPath]` markers directly into the editor (e.g., `[file:src/app.ts]`). This gives the user a visible, editable token in their prompt narrative. The marker format is both human-readable and machine-parsable. `fileRefs` remains as the transport channel at submit, but the text carries the markers that connect the narrative to the files.

```
Drop src/app.ts → editor.insertTextAtCursor("[file:src/app.ts] ")
                         ↓
          Editor: "review [file:src/app.ts] and fix [file:config.ts]"
                         ↓
          Submit: text stays as-is (markers preserved for model context)
                  fileRefs = tracker.drain() → ["src/app.ts", "config.ts"]
```

**Alternatives considered:**
- Pure attachment channel (old approach): rejected per UX feedback — users couldn't connect their prompt narrative to dropped files.
- `@path` plain text: works but lacks visual distinction from regular text.
- ANSI-colored tokens: rejected because pi-tui Editor doesn't handle ANSI in text buffer correctly (cursor steps through invisible escape chars, word-wrap breaks).

### Decision 3: resolveFileRefs as a new function, not a modification of resolveAtFileRefs

**Rationale:** `resolveAtFileRefs(text, ...)` scans text. `resolveFileRefs(fileRefs, ...)` takes an explicit array. They have different signatures and different contracts. A new function avoids:
- Breaking the existing API
- Confusing the "text contains @paths" vs "explicit paths" semantics
- Overloading with optional parameters that change behavior

```typescript
// New function — parallel to resolveAtFileRefs, same return type
function resolveFileRefs(
  projectPath: string,
  fileRefs: string[],
  limits?: Partial<AtFileLimits>,
): AtFileResolveResult;
```

Internal implementation details are shared (both call the same file-reading helpers), but the entry points are distinct.

**Alternatives considered:**
- Add `fileRefs` as an optional parameter to `resolveAtFileRefs`: rejected because the function's name and primary contract is "resolve @ references in text." Adding a separate path array parameter muddies that contract.

### Decision 4: TUI drag-and-drop detection via bracketed paste heuristics

**Rationale:** When a file is dragged into a terminal, the terminal pastes the absolute path as text, typically wrapped in bracketed paste sequences (`\x1b[200~...\x1b[201~`). The TUI's `handlePasteImage` already processes bracketed paste data.

Detection logic:
```
Bracketed paste received:
  1. Extract content between \x1b[200~...\x1b[201~
  2. If content is pure printable text (no control chars → current behavior, pass through)
  3. If content looks like a single absolute path + file exists → file drop
  4. Trim trailing newline (some terminals add \n after path)
  5. Return { consume: true, filePath: resolvedAbsPath }
```

v1 limitation: single file only. Multi-file drop detection is deferred due to terminal-specific formatting differences (some quote paths, some escape spaces, some use newlines as separators).

**Alternatives considered:**
- Kitty/iTerm2 file transfer protocols: more accurate but terminal-specific. Can be added later.
- Always treat single-line paste as potential file drop: too many false positives (users paste URLs, snippets, etc.)

### Decision 5: Path conversion at registration time, not at submit time

**Rationale:** When `FileTracker.add()` is called, it immediately determines the display path (relative or absolute) based on whether the file is within the project directory. This display path is what the UI shows. The absolute path is stored internally for the resolver.

```
add("/Users/x/project/src/app.ts", "/Users/x/project")
  → display: "src/app.ts"
  → stored:  "/Users/x/project/src/app.ts"

add("/Users/x/Downloads/report.pdf", "/Users/x/project")
  → display: "/Users/x/Downloads/report.pdf"
  → stored:  "/Users/x/Downloads/report.pdf"
```

**Alternatives considered:**
- Store absolute paths only, convert at submit time: would mean the UI displays absolute paths for project files, which is noisy.

### Decision 6: Web UI chips unchanged, but data source changes

**Rationale:** The Web UI already has a file chip system (from the `web-drag-drop-files` change). The chips currently display `FileAttachment` objects with name, size, mimeType, and path. This design changes only WHERE the data comes from: instead of populating from `File` API objects in `handleDrop`, populate from `FileTracker` entries. The `useEffect` bidirectional sync between chips and text is removed (files are no longer in the text).

Chip removal: clicking × calls `tracker.remove(path)` and removes the chip from state. No text manipulation needed.

### Decision 7: TUI attachment bar — display-only, editing via editor

**Rationale:** With `[file:xxx]` markers in the editor, the editor is the single source of truth for file management. The attachment bar becomes display-only — showing colored chips for quick scanning and hyperlink-click for opening files, but with no deletion capability. All file addition/removal happens through the editor's `[file:xxx]` markers.

```
┌──────────────────────────────────────────────────────────────┐
│  📎  src/app.ts    config.ts    logo.png                     │
│  ← → scroll · Esc clear all                                  │
└──────────────────────────────────────────────────────────────┘
```

Key behaviors:
- **Display filenames** as `c.bgBlue` chips from `tracker.getDisplayPaths()`
- **Clickable** via `hyperlink(text, 'file://' + absPath)` — OSC 8, Cmd/Ctrl+Click opens file
- **← → horizontal scroll** — pan chips when they exceed terminal width (no selection highlight needed)
- **No Backspace removal** — all file deletion happens in the editor (delete the `[file:xxx]` marker)
- **Esc clears all** — clears tracker AND strips all `[file:xxx]` markers from editor text
- **Coexistence with images** — when images present, shows `🖼 N images` chip alongside file chips
- **Bar height zero when empty** — no wasted space

**Visual design:**
- Chips: `c.bgBlue` background, no selection highlight (no editing from bar)
- Icon: `📎` (paperclip)
- Bottom hint line: `c.dim` showing `← → scroll · Esc clear all`

**Alternatives considered:**
- Interactive bar with Backspace deletion: removed — two deletion paths (bar + editor) create sync complexity.
- Inline colored tokens in Editor: rejected — pi-tui Editor doesn't handle ANSI in text buffer correctly.

**Risk:** Two-row bar consumes vertical space. → **Mitigation**: hint row only appears when files are present; empty state is zero-height.

### Decision 8: `[file:xxx]` as a format protocol with bidirectional onChange sync

**Rationale:** `[file:displayPath]` is both a visual marker for the user and a machine-readable protocol. It follows the existing `[image:N]` convention. The `onChange` handler maintains bidirectional sync between editor text and the FileTracker:

```
onChange(text):
  presentPaths = extract [file:xxx] markers from text
  currentPaths = tracker.getDisplayPaths()
  
  added   = presentPaths - currentPaths  → tracker.add() (user typed it manually)
  removed = currentPaths - presentPaths  → tracker.remove() (user deleted it)
  
  updateAttachmentBar()  // reflect changes in the chip display
```

This means:
- **Drop a file** → tracker.add() + insertTextAtCursor("[file:xxx]") → onChange syncs → bar updates
- **Type `[file:xxx]` manually** → onChange detects new marker → tracker.add() → bar updates
- **Delete `[file:xxx]` in editor** → onChange detects marker gone → tracker.remove() → bar updates
- **Esc** → tracker.clear() + strip all `[file:xxx]` from editor text → bar clears

**Submit behavior:** `[file:xxx]` markers are preserved in the text sent to the model. The model can see which files are referenced where in the user's message. `fileRefs` carries the resolved paths for file content resolution.

## Risks / Trade-offs

- **[Risk] TUI false positives**: A user pasting a file path as text could be mistaken for a file drop. → **Mitigation**: The detection requires the pasted content to be a single absolute path with an existing file. A user pasting "src/app.ts" (relative) or a non-existent path would not trigger. The risk is low.
- **[Risk] Protocol backward compatibility**: Old clients won't send `fileRefs`, new clients will. → **Mitigation**: `fileRefs` is optional (`fileRefs?: string[]`). Server treats missing `fileRefs` as empty array. Old behavior (text-based `@path` resolution) continues to work.
- **[Risk] Image files dropped in TUI**: User drops `logo.png`, expects preview like clipboard paste. → **Mitigation**: v1 resolves images at submit time via `resolveFileRefs` (same as text files). Image preview on drop can be added as a follow-up using the existing `ImagePasteHandler`.
- **[Trade-off] Two resolver functions**: `resolveAtFileRefs` and `resolveFileRefs` share internal logic but have separate entry points. → Acceptable: the separation is clean and each function has a clear, single responsibility.
- **[Trade-off] `[file:xxx]` tokens in editor text are unprotected**: cursor can enter them and typing can corrupt the path. → **Mitigation**: same as `[image:N]` placeholders — onChange detects corruption and removes from tracker. The attachment bar provides backup visibility.



## Open Questions

- **Multi-file TUI drag-and-drop**: What terminal sends for multi-file drops varies wildly. Deferred to v2.
