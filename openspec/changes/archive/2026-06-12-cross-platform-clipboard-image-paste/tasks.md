## 1. macOS clipboard — AppKit NSPasteboard

- [x] 1.1 Replace `appleScriptExtractClipboardImage` with AppKit-based NSPasteboard function using `use framework "AppKit"` and PNG/TIFF format fallback
- [x] 1.2 Test with `screencapture -c` (Ctrl+Shift+Cmd+4) screenshots
- [x] 1.3 Test with images copied from Preview.app (TIFF-dominant clipboard)
- [x] 1.4 Test with text-only clipboard (should return null no error)
- [x] 1.5 Verify both blocking (`readClipboardImage`) and non-blocking (`readClipboardImageNonBlocking`) work

## 2. Windows clipboard — PowerShell + System.Windows.Forms

- [x] 2.1 Add `win32ClipboardScript()` function generating PowerShell script with `-Sta` flag and `System.Windows.Forms.Clipboard`
- [x] 2.2 Wire into `readClipboardImage` (execSync) and `readClipboardImageNonBlocking` (exec)
- [x] 2.3 Handle PowerShell not found gracefully (catch error, return null)
- [x] 2.4 Handle clipboard empty/no-image (PowerShell returns null, skip file read)

## 3. Linux clipboard — xclip / wl-paste

- [x] 3.1 Add `linuxClipboardScript()` with display server auto-detection (`$WAYLAND_DISPLAY` vs `$DISPLAY`)
- [x] 3.2 Implement one-time tool availability probe with result caching
- [x] 3.3 Wire into `readClipboardImage` and `readClipboardImageNonBlocking`
- [x] 3.4 Handle tool not installed: return null without error, distinguish from "installed but clipboard empty"

## 4. Kitty protocol — decode base64 payload

- [x] 4.1 Rewrite `handleKittyImageProtocol()` to parse Kitty APC format: `ESC _ G <params> ; <base64> ESC \`
- [x] 4.2 Extract base64 payload and decode to binary buffer
- [x] 4.3 Support multi-chunk transmission: accumulate chunks keyed by payload ID until `v=8` (final)
- [x] 4.4 Add 200ms timeout flush for incomplete multi-chunk transmissions
- [x] 4.5 Skip non-image Kitty sequences (`f` param not 24)
- [x] 4.6 Replace clipboard fallback call with direct `imagePasteHandler.addImage()`
- [x] 4.7 Handle malformed base64 gracefully (consume sequence, no crash)

## 5. End-to-end integration & edge cases

- [x] 5.1 Verify Kitty decode → addImage → addDraftImage → inline display chain in Ghostty
- [x] 5.2 Verify mixed text + Kitty image paste (text extracted, image decoded)
- [x] 5.3 Verify Cmd+V shortcut still triggers clipboard paste on non-Kitty terminals
- [x] 5.4 Verify `/image clipboard` command uses new implementation
- [x] 5.5 Verify debounce guard (`lastPasteTime`) works correctly with new Kitty handler
- [x] 5.6 Verify platform detection dispatch (`process.platform`) for all three platforms

## 6. Tests

- [x] 6.1 Unit tests for Kitty APC sequence parsing (single chunk, multi-chunk, malformed, non-image)
- [x] 6.2 Unit tests for platform-specific clipboard script generation
- [x] 6.3 Unit tests for platform dispatch logic
- [ ] 6.4 Manual testing on macOS, Windows, and Linux
