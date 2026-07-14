## Why

JPEG and WebP images — referenced via `@file` or pasted from clipboard — are saved to disk and sent to the LLM correctly, but never render inline in the terminal. The Kitty graphics protocol that pi-tui uses only supports PNG passthrough (`f=100`), and pi-tui's `encodeKitty()` hardcodes this format. Sending JPEG or WebP data labeled as PNG causes the terminal to silently fail decoding. Worse, files with mismatched extensions (e.g., a WebP image named `.png`) bypass all guards and fail silently with no indication of the real problem.

## What Changes

- Add `jpeg-js` and `pngjs` as dependencies (pure JS, no native addons)
- Add a sync format detection + conversion utility in `src/utils/` that identifies actual image format from magic bytes, not file extension
- Convert JPEG and WebP to PNG in `resolveAtFileRefs` and `ConversationView.addInlineImage()` before passing to the `Image` component
- Detect true image format from magic bytes (not extension) so misnamed files (WebP as `.png`) are handled correctly

## Capabilities

### New Capabilities

- `non-png-terminal-rendering`: Non-PNG images (JPEG, WebP) are detected by magic bytes and converted to PNG at the rendering layer so they render inline in Kitty/iTerm2 terminals. Format detection is based on file content, not extension, preventing silent failures from misnamed files.

### Modified Capabilities

None. This is purely an enhancement to the existing image rendering pipeline — the JPEG skip in `addInlineImage` was always a workaround, not a spec-level behavior.

## Impact

- **New dependencies**: `jpeg-js` (~80KB), `pngjs` (~50KB) — both pure JavaScript, zero native addons, used by millions of projects
- **Affected code**: `src/ui/conversation.ts` (remove JPEG skip, add conversion call), new file `src/utils/image-convert.ts`
- **No API changes**: `addInlineImage()` signature unchanged, all callers unaffected
- **Graceful fallback**: If JPEG decode fails (corrupt file), the existing try/catch around `new Image()` handles it — file path text still shows
