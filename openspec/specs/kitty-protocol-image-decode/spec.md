## ADDED Requirements

### Requirement: Decode Kitty image protocol payload from paste events
The system SHALL decode base64-encoded image data from Kitty terminal graphics protocol APC sequences received as paste input, instead of discarding the data and falling back to system clipboard. Decoding SHALL happen in `handleKittyImageProtocol` in `src/ui/tui/app.ts`.

The Kitty APC sequence format is: `ESC _ G <key>=<value>,... ; <base64> ESC \`
- `f=24` indicates PNG format
- `s=<n>` indicates chunk size
- `v=8` indicates the final chunk (others are `v=16` for intermediate chunks)

#### Scenario: Single-chunk Kitty image paste in Ghostty
- **WHEN** user pastes a small image in Ghostty (Cmd+V)
- **AND** Ghostty sends a single Kitty APC sequence with `v=8` (final chunk)
- **THEN** `handleKittyImageProtocol` extracts the base64 payload
- **AND** decodes it to binary buffer
- **AND** calls `this.imagePasteHandler.addImage()` with `{ type: "image", data: <base64>, mimeType: "image/png" }`
- **AND** the image appears as a draft in the conversation view

#### Scenario: Multi-chunk Kitty image paste
- **WHEN** Ghostty sends a large image split across multiple Kitty APC chunks
- **AND** intermediate chunks have `v=16`
- **AND** the final chunk has `v=8`
- **THEN** the system SHALL accumulate base64 chunks in order
- **AND** upon receiving the final chunk (`v=8`), decode the complete payload
- **AND** call `addImage()` with the full image

#### Scenario: Kitty sequence timeout (incomplete transmission)
- **WHEN** the system receives a Kitty chunk but no final chunk within 200ms
- **THEN** the accumulated buffer SHALL be discarded
- **AND** no partial image is added
- **AND** no error is displayed (silent discard)

#### Scenario: Non-image Kitty APC sequence (e.g., cursor shape control)
- **WHEN** a Kitty APC sequence does not contain `f=24` (PNG format indicator)
- **THEN** `handleKittyImageProtocol` SHALL return `false`
- **AND** the data SHALL pass through to other handlers unchanged

#### Scenario: Malformed base64 in Kitty payload
- **WHEN** the Kitty APC sequence contains invalid base64 data
- **THEN** the decode SHALL fail gracefully
- **AND** `handleKittyImageProtocol` SHALL return `true` (consume the sequence)
- **AND** no image is added
- **AND** no crash or unhandled exception occurs

### Requirement: Kitty decode path bypasses clipboard fallback
When `handleKittyImageProtocol` successfully decodes image data from a Kitty APC sequence, the system SHALL NOT call `readClipboardImageNonBlocking()` as a fallback. The decoded data is the image. The clipboard reader is unnecessary and should be skipped to avoid the race condition and platform dependency.

#### Scenario: Successful Kitty decode skips clipboard
- **WHEN** Kitty image data is successfully decoded
- **THEN** `addImage()` is called with the decoded data
- **AND** `readClipboardImageNonBlocking()` is NOT called

#### Scenario: Kitty decode failure does NOT fall back to clipboard
- **WHEN** Kitty APC sequence is detected but decode fails (malformed data)
- **THEN** the sequence is consumed (returns `true`)
- **AND** `readClipboardImageNonBlocking()` is NOT called
- **AND** no error message is shown (the paste is simply consumed)

### Requirement: Ghostty inline image display after paste
When an image is successfully added via Kitty protocol decode, the system SHALL render the image inline in the conversation view using the existing pi-tui `Image` component. This path already exists via `imagePasteHandler.addImage()` → `conversation.addDraftImage()` → `addInlineImage()`. No display pipeline changes are required, but this path SHALL be verified end-to-end.

#### Scenario: Pasted image appears inline in Ghostty
- **WHEN** an image is pasted and decoded from Kitty protocol
- **AND** `imagePasteHandler.addImage()` is called
- **THEN** a draft image block appears in the conversation view
- **AND** the image is rendered inline using pi-tui `Image`
- **AND** a `[image:<id>]` placeholder is inserted in the editor
- **AND** the image status bar updates with count and total size

### Requirement: Mixed text + image paste in Kitty protocol
The system SHALL support pasting text and images together via Kitty protocol. If translatable text is embedded alongside the Kitty APC sequence in the paste data, the text SHALL be extracted and passed through to the editor while the image is added as a draft.

#### Scenario: Text before Kitty image sequence
- **WHEN** paste data contains: `"describe this:\n"` followed by a Kitty APC image sequence
- **THEN** the text `"describe this:\n"` is passed to the editor
- **AND** the image is decoded and added as a draft
- **AND** both text and image are ready for submission
