## ADDED Requirements

### Requirement: TuiApp SHALL trigger visible render after async image insertion

When an image is inserted via `addImage()` from an async callback (outside the pi-tui input listener call stack), the system SHALL ensure the `[image:N]` placeholder becomes immediately visible in the editor. The `tui.requestRender(true)` call within `addImage` alone is insufficient in async contexts because pi-tui's render loop is driven by input events.

The system SHALL call `this.tui.requestRender(true)` with an explicit `setTimeout(0)` deferral from the async callback site, in addition to the `requestRender(true)` already called within `ImagePasteHandler.updateStatus()`. This ensures a render is scheduled regardless of pi-tui's internal timer state.

#### Scenario: pasteClipboardImage async callback renders placeholder immediately

- **WHEN** `pasteClipboardImage()` receives an image via `readClipboardImageNonBlocking().then(img => addImage(img))`
- **AND** no subsequent user input follows the paste
- **THEN** the `[image:N]` placeholder SHALL appear in the editor within one render cycle
- **AND** the image status bar SHALL reflect the updated image count
- **AND** no additional keystroke from the user SHALL be required to see the placeholder

#### Scenario: handleKittyProtocol queueMicrotask renders placeholder immediately

- **WHEN** `handleKittyProtocol()` decodes a final Kitty chunk and calls `queueMicrotask(() => addImage(img))`
- **AND** no subsequent user input follows the data event
- **THEN** the `[image:N]` placeholder SHALL appear in the editor within one render cycle
- **AND** no additional keystroke SHALL be required

#### Scenario: Synchronous addImage still renders correctly

- **WHEN** `addImage(img)` is called synchronously (e.g., from `/image clipboard` command)
- **THEN** the existing `requestRender(true)` in `ImagePasteHandler.updateStatus()` SHALL continue to work as before
- **AND** the additional `setTimeout(0)` render call from async paths SHALL NOT cause duplicate renders or flickering

