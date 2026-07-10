## ADDED Requirements

### Requirement: JPEG images render inline in terminal

The system SHALL convert JPEG images to PNG at the conversation view layer so they render inline via the Kitty/iTerm2 graphics protocol, identical to PNG/GIF/WebP/BMP images.

The conversion SHALL be synchronous and SHALL NOT change the signature of `addInlineImage()`.

#### Scenario: @file JPEG reference renders inline

- **WHEN** user types `@photo.jpg` and presses Enter
- **THEN** the JPEG is decoded and re-encoded as PNG
- **AND** the PNG is rendered inline in the terminal via `Image` component
- **AND** the file is also saved to `~/.dscode/image-cache/` with `.png` extension
- **AND** the file path text `[image: /path/to/cached/file.png]` is displayed

#### Scenario: Clipboard JPEG paste renders inline

- **WHEN** user pastes a JPEG image from clipboard
- **THEN** the JPEG is decoded and re-encoded as PNG
- **AND** the PNG renders inline in the conversation view as a draft preview
- **AND** pressing Enter sends the image to the agent

#### Scenario: JPEG renders inline during session replay

- **WHEN** a session is loaded from disk containing JPEG image content
- **THEN** the JPEG is decoded and re-encoded as PNG
- **AND** the PNG renders inline in the conversation view

### Requirement: Conversion failure degrades gracefully

The system SHALL handle JPEG decode or PNG encode failures without disrupting the conversation flow.

#### Scenario: Corrupt JPEG file

- **WHEN** the JPEG decoder throws an error on corrupt data
- **THEN** the conversion returns null
- **AND** the file path text `[image: /path/to/cached/file.jpg]` is still displayed
- **AND** no exception propagates to the caller

#### Scenario: Memory exhaustion during conversion

- **WHEN** the JPEG decode or PNG encode fails due to insufficient memory
- **THEN** the conversion returns null
- **AND** the system continues operating normally with file path fallback

### Requirement: Non-JPEG images are unaffected

The system SHALL pass through PNG, GIF, WebP, and BMP images without any conversion.

#### Scenario: PNG image passes through unchanged

- **WHEN** `addInlineImage` receives PNG base64 data with `image/png` mime type
- **THEN** the data is passed directly to the `Image` component
- **AND** no decode/encode cycle occurs
