## MODIFIED Requirements

### Requirement: Paste handlers use addImage

When any paste mechanism (Bracketed, Kitty, Ctrl+V, empty-submit) successfully reads a clipboard image, it SHALL call `this.imagePasteHandler.addImage(img)`. For async paste paths (Ctrl+V via `pasteClipboardImage()`, Kitty via `queueMicrotask`), the caller SHALL additionally schedule a deferred render via `setTimeout(() => this.tui.requestRender(true), 0)` to ensure the placeholder appears without waiting for subsequent user input.

#### Scenario: Any paste mechanism uses addImage with deferred render

- **WHEN** any paste mechanism (Bracketed, Kitty, Ctrl+V, empty-submit) successfully reads a clipboard image via async callback
- **THEN** it SHALL call `this.imagePasteHandler.addImage(img)`
- **AND** it SHALL call `setTimeout(() => this.tui.requestRender(true), 0)` after `addImage`
- **AND** SHALL NOT directly manipulate `ImageManager`

#### Scenario: Synchronous paste paths do not add redundant render calls

- **WHEN** a paste path calls `addImage(img)` synchronously (within the input listener call stack)
- **THEN** it SHALL NOT add an extra `setTimeout` render call
- **AND** the existing `requestRender(true)` in `updateStatus` SHALL suffice
