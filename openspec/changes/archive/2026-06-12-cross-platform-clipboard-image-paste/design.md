## Context

The TUI image paste pipeline currently has two critical gaps:

1. **Clipboard reading is macOS-only + single-format**: `readClipboardImageNonBlocking()` in `src/drivers/vision/reader.ts` uses AppleScript `«class PNGf»` coercion — a fragile approach that fails for TIFF-only clipboard data and returns `null` on Windows/Linux.

2. **Kitty protocol data is discarded**: `handleKittyImageProtocol()` in `src/ui/tui-app.ts` detects Kitty APC sequences (`ESC _ G ... ESC \`) but throws away the base64 payload and falls back to `readClipboardImageNonBlocking()`. The comment reads: "extracting base64 from Kitty protocol chunks is fragile."

The image display path (`conversation.addInlineImage` → pi-tui `Image`) already works across terminals that support the Kitty graphics protocol (Ghostty, Kitty, iTerm2 with Kitty protocol enabled). The gap is exclusively on the input side.

## Goals / Non-Goals

**Goals:**
- Reliable clipboard image read on macOS using AppKit NSPasteboard (PNG → TIFF → JPEG fallback)
- Clipboard image read on Windows using PowerShell + System.Windows.Forms
- Clipboard image read on Linux using xclip (X11) or wl-paste (Wayland) with auto-detection
- Decode Kitty protocol base64 payload directly from paste events, bypassing clipboard entirely
- Preserve all existing image paste behaviors: Cmd+V shortcut, bracketed paste detection, mixed text+image extraction

**Non-Goals:**
- Image paste via drag-and-drop in TUI (terminal limitation)
- Modifying the image display/render pipeline (pi-tui `Image` — already works)
- Adding clipboard read support for platforms not listed (BSD, etc.)
- Installing `xclip` or `wl-paste` automatically on Linux (user installs these themselves)

## Decisions

### Decision 1: macOS — AppKit NSPasteboard over AppleScript `«class PNGf»`

**Chosen**: `osascript` with `use framework "AppKit"` and `NSPasteboard.generalPasteboard().dataForType:`

```applescript
use framework "AppKit"
set pb to current application's NSPasteboard's generalPasteboard()
-- Try PNG first, then TIFF
set imgData to pb's dataForType:(current application's NSPasteboardTypePNG)
if imgData is missing value then
  set imgData to pb's dataForType:(current application's NSPasteboardTypeTIFF)
end if
if imgData is not missing value then
  imgData's writeToFile:tmpPath atomically:true
end if
```

**Alternatives considered:**
- `pngpaste` CLI tool → requires Homebrew install, not built-in
- Swift compiled helper → adds build complexity, overkill for this
- Keeping `«class PNGf»` and adding TIFF fallback → AppleScript image class coercion is unreliable; AppKit uses the same NSPasteboard API as native macOS apps

**Rationale**: AppKit NSPasteboard is the canonical macOS clipboard API. Every macOS app (Preview, Safari, Finder) reads images through NSImage/NSPasteboard. Using the same API guarantees format compatibility.

### Decision 2: Windows — PowerShell + System.Windows.Forms

**Chosen**: `powershell -Sta -Command` with `System.Windows.Forms.Clipboard.GetImage()`

```powershell
Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) {
    $img.Save('<tmpPath>', [System.Drawing.Imaging.ImageFormat]::Png)
}
```

**Alternatives considered:**
- C# compiled helper → faster startup but requires build toolchain
- Python + PIL → unreliable (Python may not be installed)
- WinRT `DataPackageView` → requires Windows 10 SDK, more complex

**Rationale**: PowerShell is pre-installed on all Windows 10/11 systems. The `-Sta` flag is required because `System.Windows.Forms.Clipboard` needs a Single-Threaded Apartment. Startup latency (~300-800ms) is acceptable for a paste operation.

### Decision 3: Linux — xclip/wl-paste auto-detection

**Chosen**: Probe for `xclip` and `wl-paste` at first paste, cache availability.

```typescript
// On first call, detect display server and available tools
// Cache result — no need to re-probe every paste
if (process.env.WAYLAND_DISPLAY) {
  // Try wl-paste first
} else if (process.env.DISPLAY) {
  // Try xclip
}
```

**Alternatives considered:**
- Bundling a Rust/Go clipboard binary → maintenance burden
- Using `xsel` → feature-equivalent to xclip, but xclip is more common

**Rationale**: `xclip` and `wl-paste` are the de facto clipboard tools on Linux. Graceful degradation: if neither tool is found, clipboard image paste is unavailable and the user receives a clear message suggesting installation.

### Decision 4: Decode Kitty protocol data instead of discarding

**Chosen**: Parse the Kitty APC sequence `ESC _ G <params> ; <base64> ESC \` in `handleKittyImageProtocol`, extract the base64 payload, and create an ImageContent directly — no clipboard fallback needed.

Format reference: Kitty protocol transmits images in chunks. A single transmission has format:
```
ESC _ G f=24,t=d,s=10,v=8; <base64> ESC \
```
Where: `f=24` = PNG format, `s=10` = chunk size, `v=8` = final chunk.

**Alternatives considered:**
- Keep current fallback → fails on Windows/Linux, fragile on macOS
- Use a third-party kitty decoder library → no good TS library exists; the protocol is simple enough

**Rationale**: The Kitty protocol is a simple APC wrapper around base64-encoded image data. Parsing it is straightforward — the comment calling it "fragile" was overly cautious. Decoding directly means the paste works even if clipboard reading fails (e.g., terminal doesn't have clipboard access), and removes the clipboard dependency entirely for Kitty/Ghostty users.

### Decision 5: Platform detection and fallback ordering

```
┌─────────────────────────────────────────────────────────────┐
│                    Image Paste Decision Tree                  │
└─────────────────────────────────────────────────────────────┘

  Input arrives
       │
       ▼
  ┌─────────────┐     YES    ┌──────────────────┐
  │ Kitty APC?  │──────────▶│ Decode base64     │
  │ (ESC _ G)   │           │ → ImageContent    │
  └──────┬──────┘           └──────────────────┘
         │ NO
         ▼
  ┌────────────────┐  YES   ┌───────────────────┐
  │ Bracketed paste│──────▶│ Try clipboard read  │
  │ with binary?   │       │ (platform-specific) │
  └──────┬─────────┘       └───────────────────┘
         │ NO                       │
         ▼                  ┌──────┴──────┐
     Normal text            │ Success?     │
     input                  └──────┬───────┘
                            YES    │    NO
                            │      │
                            ▼      ▼
                        addImage()  Silent (image may
                                    be embedded in paste
                                    binary — but without
                                    clipboard fallback,
                                    skip gracefully)
```

## Risks / Trade-offs

- **[Risk] PowerShell startup latency (300-800ms)** → Mitigation: Acceptable for paste operations; non-blocking exec pattern already in use; could add a loading indicator if needed
- **[Risk] `xclip`/`wl-paste` not installed on Linux** → Mitigation: Graceful degradation with clear error message suggesting installation command (`sudo apt install xclip` / `sudo apt install wl-paste`)
- **[Risk] Kitty protocol chunked transmission** → Mitigation: Accumulate chunks across multiple input events until `v=8` (final chunk); all chunks in a single paste arrive in rapid succession so a simple buffer with a 200ms flush timeout handles this
- **[Risk] macOS AppleScript permissions may block `osascript` from accessing clipboard** → Mitigation: AppKit approach uses the same permissions model as all native apps; if permissions are denied, the previous AppleScript approach would have also failed — this is not a regression
- **[Trade-off] Removing clipboard fallback from Kitty path** → The Kitty path no longer touches clipboard. If kitty decode fails for any reason, the image is lost (vs. before where clipboard fallback might have worked on macOS). Mitigation: the decode is deterministic (parse base64) and far more reliable than the clipboard fallback
