## Why

TUI image paste works only on macOS, and only when the system clipboard happens to contain data in `«class PNGf»` format — a fragile single-format AppleScript coercion. Windows and Linux return `null` for all clipboard reads. Additionally, Kitty-protocol terminals (Ghostty, Kitty) send actual image data to the TUI that is currently discarded and re-fetched from the clipboard instead of being decoded directly. Users on all platforms need reliable image paste, and in Ghostty, pasted images should display inline in the conversation.

## What Changes

- **macOS**: Replace AppleScript `«class PNGf»` single-format coercion with AppKit NSPasteboard API supporting multi-format fallback (PNG → TIFF → JPEG)
- **Windows**: Add clipboard image reading via PowerShell + `System.Windows.Forms.Clipboard`
- **Linux**: Add clipboard image reading via `xclip` (X11) and `wl-paste` (Wayland) auto-detection
- **Kitty protocol**: Decode Kitty image protocol base64 payload directly in `handleKittyImageProtocol` instead of discarding it and falling back to system clipboard
- **Ghostty display**: TUI already renders images via pi-tui `Image` (kitty protocol output) — confirm this path works end-to-end with the decoded Kitty paste data

## Capabilities

### New Capabilities

- `cross-platform-clipboard-image`: Platform-native clipboard image reading for macOS (AppKit), Windows (PowerShell/WinForms), and Linux (xclip/wl-paste)
- `kitty-protocol-image-decode`: Decode Kitty terminal graphics protocol image payloads from paste events instead of discarding and falling back to system clipboard

### Modified Capabilities

- `vision-pipeline`: `reader.ts` must support new platform-specific clipboard read implementations; `readClipboardImage` and `readClipboardImageNonBlocking` gain Windows and Linux implementations instead of returning `null`
- `tui-paste-notification`: Kitty-protocol paste events that carry image data should no longer fall through to the clipboard fallback path, changing the notification behavior for Ghostty/Kitty users

## Impact

- `src/drivers/vision/reader.ts` — complete rewrite of clipboard reading functions (AppleScript → AppKit for macOS, new PS for Windows, new xclip/wl-paste for Linux)
- `src/ui/tui-app.ts` — `handleKittyImageProtocol` rewritten to decode base64 from Kitty APC sequences instead of deferring to clipboard
- `src/ui/image-paste-handler.ts` — no API changes, but `addImage` will now be called from the kitty decode path in addition to clipboard path
- `tests/` — platform mock tests for new clipboard strategies, kitty protocol decode unit tests
- No new dependencies beyond platform-standard tools (PowerShell on Windows is built-in; `xclip`/`wl-paste` on Linux are common but optional — graceful degradation if absent)
