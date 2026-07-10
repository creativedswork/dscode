## ADDED Requirements

### Requirement: Image file resolution from @ references
When `resolveAtFileRefs` encounters an `@`-referenced file whose extension matches an image format (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`), the system SHALL read the file as base64, include it in the `images` array of the returned `AtFileResolveResult`, and replace the `@path` text with an image indicator `[Image: @path]`.

#### Scenario: Image file within size limit
- **WHEN** user submits a message containing `@screenshot.png` and the file exists and is within `maxImageSize` (default 20MB)
- **THEN** the system SHALL read the file, encode it as base64, and include it in `resolved.images`
- **AND** the text reference SHALL be replaced with `[Image: @screenshot.png]`

#### Scenario: Image file exceeds image size limit — submission rejected
- **WHEN** user submits a message containing `@large-photo.jpg` and the file exceeds `maxImageSize`
- **THEN** the system SHALL reject the entire prompt submission
- **AND** the system SHALL display a warning to the user: "@large-photo.jpg: exceeds max image size (20MB)"
- **AND** the prompt SHALL NOT be sent to the model

### Requirement: Fatal warnings reject prompt submission
When `resolveAtFileRefs` encounters an image that exceeds `maxImageSize`, it SHALL return a result with `reject: true`. The callers (`handleSubmit` in TUI, `handleMessage` in Web UI) SHALL check this flag and abort the prompt submission without sending any message to the model.

#### Scenario: TUI rejects oversized image
- **WHEN** user submits `@huge-photo.jpg` in TUI and the file exceeds `maxImageSize`
- **THEN** `handleSubmit` SHALL check `resolved.reject` and return without calling `promptWithImages()` or `agent.prompt()`
- **AND** a warning SHALL be displayed in the conversation view

#### Scenario: Web UI rejects oversized image
- **WHEN** web client sends `{ "type": "chat", "text": "@huge-photo.jpg" }` and the file exceeds `maxImageSize`
- **THEN** the server SHALL check `resolved.reject` and send an error back to the client
- **AND** the prompt SHALL NOT be forwarded to the agent

#### Scenario: Non-existent image file
- **WHEN** user submits a message containing `@nonexistent.png` and the file does not exist
- **THEN** the system SHALL emit a `not_found` warning
- **AND** the `@nonexistent.png` text SHALL remain unchanged in the resolved text

#### Scenario: Image files not counted toward maxTotalSize
- **WHEN** multiple `@` references include both text files and image files
- **THEN** only the text file content sizes SHALL be counted toward `maxTotalSize`
- **AND** image file sizes SHALL NOT contribute to the `maxTotalSize` calculation

### Requirement: Image resolution integrates with prompt submission
The resolved image `ImageRef` objects SHALL be converted to `ImageContent` and merged with any paste/upload images, then passed to `promptWithImages()` which routes them through the vision/OCR pipeline.

#### Scenario: TUI @-image merged with paste images
- **WHEN** user pastes an image (adds `[image:N]` placeholder) AND types `@photo.jpg` in the same message
- **THEN** both the paste image and the `@photo.jpg` image SHALL be included in the combined images array
- **AND** SHALL be passed to `promptWithImages()` together

#### Scenario: TUI @-image only (no paste)
- **WHEN** user submits `@photo.jpg` without any paste images
- **THEN** `resolveAtFileRefs` SHALL return the image in `resolved.images`
- **AND** `handleSubmit` SHALL pass it to `promptWithImages()` which routes through the vision pipeline

#### Scenario: Web UI @-image
- **WHEN** web client sends `{ type: "chat", text: "@photo.jpg" }` with no `images` field
- **THEN** the server SHALL call `resolveAtFileRefs` to extract the image
- **AND** SHALL pass the resolved image to `promptWithImages()`

### Requirement: maxImageSize configuration
The image size limit SHALL be configurable via the `atFileMaxImageSize` setting with a default of 20,971,520 bytes (20MB).

#### Scenario: Default image size limit
- **WHEN** no `atFileMaxImageSize` is configured in settings
- **THEN** the system SHALL use 20MB as the default image size limit

#### Scenario: Custom image size limit
- **WHEN** `.dscode/settings.json` contains `{ "atFileMaxImageSize": 5242880 }`
- **THEN** the system SHALL use 5MB as the image size limit
