## Why

When a user drags an image file into the TUI (via Ghostty or similar terminals), the current code correctly:
- Detects the file path from the bracketed paste
- Stores the absolute path in `FileTracker`
- Inserts a `[file:<displayName>]` placeholder
- Reads the image as base64 and sends it to the model

However, the image's **absolute path is not exposed to the LLM**. Only non-image files get their paths injected into the prompt (`📁 Attached files:\n- \`/abs/path\``). Image files go through `resolveFileRefs` → base64, and the path is discarded. The LLM receives the image pixels but has no idea where the file came from — it cannot reference, save to, or reason about the source path.

Additionally, the `[file:xxx]` placeholder in the TUI editor only shows the filename. The user cannot see the absolute path without submitting and checking the non-image file prompt injection.

## What Changes

- **Submit path injection for image fileRefs**: When `fileRefs` contains image paths, inject the absolute paths into the prompt text alongside the base64 image data, using the same `📁 Attached files:` format already used for non-image files.
- **TUI hover tooltip on `[file:xxx]`**: When the user hovers over a `[file:xxx]` placeholder in the editor, show the full absolute path. Implementation TBD: either pi-tui native hover support, or a status bar line that updates on cursor position.

## Capabilities

### Modified Capabilities
- `tui-image-placeholder-identity`: The `[file:xxx]` placeholder now supports hover-to-reveal absolute path.
- `image-pipeline`: Image fileRefs absolute paths are now included in the enriched prompt text sent to the model.

## Impact

- `src/ui/tui-app.ts`: Submit handler (~line 1340) — add path injection for imageRefs. Attachment bar / hover — show absolute path on hover.
- `src/ui/shared/file-tracker.ts`: May need a `getAbsPath(displayPath: string): string | undefined` method for reverse lookup.
