## ADDED Requirements

### Requirement: macOS clipboard image read via AppKit NSPasteboard
The system SHALL read images from the macOS system clipboard using AppKit's NSPasteboard API with multi-format fallback. The implementation SHALL replace the existing AppleScript `«class PNGf»` single-format coercion in `readClipboardImage` and `readClipboardImageNonBlocking`.

The system SHALL attempt formats in order: `NSPasteboardTypePNG`, then `NSPasteboardTypeTIFF`. If PNG data is available, it SHALL be written directly. If only TIFF is available, the system SHALL convert it to PNG using `NSBitmapImageRep` before writing to the temp file.

#### Scenario: Screenshot copied to clipboard via Ctrl+Shift+Cmd+4
- **WHEN** user takes a macOS screenshot to clipboard (saving as PNGf format)
- **AND** `readClipboardImageNonBlocking()` is called
- **THEN** AppKit reads `NSPasteboardTypePNG` data directly
- **AND** the resulting `ImageContent` has `mimeType: "image/png"` and non-zero data length

#### Scenario: Image copied from Preview.app (TIFF clipboard format)
- **WHEN** user copies an image from Preview.app (Cmd+C)
- **AND** the clipboard contains TIFF data but no PNG data
- **THEN** AppKit falls back to `NSPasteboardTypeTIFF`
- **AND** converts TIFF to PNG via `NSBitmapImageRep`
- **AND** the resulting `ImageContent` has `mimeType: "image/png"` and non-zero data length

#### Scenario: Clipboard contains only text (no image)
- **WHEN** the system clipboard contains only text data
- **THEN** both `dataForType:NSPasteboardTypePNG` and `dataForType:NSPasteboardTypeTIFF` return missing value
- **AND** `readClipboardImageNonBlocking()` resolves with `null`

### Requirement: Windows clipboard image read via PowerShell
The system SHALL read images from the Windows system clipboard using PowerShell with `System.Windows.Forms.Clipboard`. The implementation SHALL be non-blocking (`child_process.exec`) and SHALL run PowerShell in STA mode (`-Sta`) as required by the WinForms clipboard API.

#### Scenario: Image in Windows clipboard pasted via Cmd+V
- **WHEN** user has an image in the Windows clipboard
- **AND** presses Ctrl+V in TUI
- **THEN** PowerShell script executes `[System.Windows.Forms.Clipboard]::GetImage()`
- **AND** saves the image as PNG to a temp file
- **AND** the resulting `ImageContent` has `mimeType: "image/png"` and non-zero data length

#### Scenario: Windows clipboard has no image
- **WHEN** the Windows clipboard contains only text or is empty
- **THEN** `[System.Windows.Forms.Clipboard]::GetImage()` returns `$null`
- **AND** `readClipboardImageNonBlocking()` resolves with `null`

#### Scenario: PowerShell unavailable (unusual Windows configuration)
- **WHEN** PowerShell is not found on the system PATH
- **THEN** the system SHALL catch the exec error and resolve with `null`
- **AND** no crash or unhandled rejection occurs

### Requirement: Linux clipboard image read via xclip or wl-paste
The system SHALL auto-detect the display server (X11 via `$DISPLAY` or Wayland via `$WAYLAND_DISPLAY`) and invoke the appropriate clipboard tool. On first invocation, the system SHALL probe for tool availability and cache the result. If neither tool is available, the system SHALL return `null` without error.

#### Scenario: X11 with xclip available
- **WHEN** `$DISPLAY` is set and `xclip` is on PATH
- **AND** clipboard contains an image
- **THEN** `xclip -selection clipboard -t image/png -o` writes PNG data to temp file
- **AND** the resulting `ImageContent` has non-zero data length

#### Scenario: Wayland with wl-paste available
- **WHEN** `$WAYLAND_DISPLAY` is set and `wl-paste` is on PATH
- **AND** clipboard contains an image
- **THEN** `wl-paste -t image/png` writes PNG data to temp file
- **AND** the resulting `ImageContent` has non-zero data length

#### Scenario: No clipboard tool available on Linux
- **WHEN** neither `xclip` nor `wl-paste` is found on PATH
- **THEN** the system SHALL cache this unavailability
- **AND** all subsequent calls SHALL immediately resolve with `null`
- **AND** no error is thrown or logged

#### Scenario: Wayland takes priority when both display servers are set
- **WHEN** both `$WAYLAND_DISPLAY` and `$DISPLAY` are set
- **THEN** the system SHALL prefer `wl-paste` (Wayland)
- **AND** fall back to `xclip` only if `wl-paste` is not available

### Requirement: Platform-specific clipboard script isolation
The system SHALL isolate platform-specific clipboard scripts into separate functions within `reader.ts`. Each platform function SHALL be stateless (accept tmpPath, return success/failure). The platform dispatch SHALL happen once per `readClipboardImage` / `readClipboardImageNonBlocking` call based on `process.platform`.

#### Scenario: Platform detection dispatches correctly
- **WHEN** `process.platform === "darwin"` — macOS AppKit function is called
- **WHEN** `process.platform === "win32"` — Windows PowerShell function is called
- **WHEN** `process.platform === "linux"` — Linux xclip/wl-paste function is called
- **WHEN** any other platform — returns `null` immediately

### Requirement: Existing synchronous API preserved
The system SHALL preserve `readClipboardImage()` (blocking, used by `/image clipboard` command) and `readClipboardImageNonBlocking()` (async, used by paste handlers) function signatures. Both SHALL use the new platform-specific implementations internally.

#### Scenario: Blocking readClipboardImage still works
- **WHEN** `/image clipboard` slash command is executed
- **THEN** `readClipboardImage()` uses `execSync` with the platform-specific script
- **AND** returns `ImageContent | null` synchronously

#### Scenario: Non-blocking readClipboardImageNonBlocking still works
- **WHEN** Cmd+V triggers `pasteClipboardImage()`
- **THEN** `readClipboardImageNonBlocking()` uses `exec` with callback
- **AND** returns `Promise<ImageContent | null>`
