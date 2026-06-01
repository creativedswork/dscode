## MODIFIED Requirements

### Requirement: Image Resize and Compression
The system SHALL resize images to a unified height of 480 pixels, maintaining original aspect ratio for width. This functionality SHALL be provided by `ImageCache` as a sub-module of `ImagePipeline` at `src/image-pipeline/cache.ts`.

#### Scenario: Uploaded image is larger than 480px tall
- **WHEN** a user uploads an image with height > 480px
- **THEN** the system SHALL resize to height=480px with proportional width
- **AND** the resized image SHALL be saved as JPEG quality 85

#### Scenario: Uploaded image is smaller than 480px tall
- **WHEN** a user uploads an image with height ≤ 480px
- **THEN** the system SHALL NOT upscale the image
- **AND** the image SHALL be saved as-is (only re-encoded as JPEG)

#### Scenario: Image compression failure
- **WHEN** image resizing or encoding fails
- **THEN** the system SHALL log the error and fall back to using the original image

### Requirement: Content-Addressed Cache Storage
The system SHALL store compressed images in `~/.dscode/data/images/` with content-addressed filenames. This functionality SHALL be provided by `ImageCache` within the `ImagePipeline` module.

#### Scenario: Cache write
- **WHEN** an image is compressed
- **THEN** the system SHALL compute `sha256(image_data).slice(0, 16)` as the filename
- **AND** write to `~/.dscode/data/images/<hash>.jpg`
- **AND** return an `ImageRef` with `{ type: "image_ref", hash: "<hash>.jpg", mimeType: "image/jpeg" }`

#### Scenario: Cache read
- **WHEN** the system reads an `ImageRef`
- **THEN** it SHALL construct the full path as `~/.dscode/data/images/<hash>`
- **AND** if the file exists, read and return the image data as base64 with mimeType
- **AND** if the file does not exist, return `null`

#### Scenario: Deduplication
- **WHEN** two identical images are uploaded (same content)
- **THEN** they produce the same hash filename
- **AND** only one copy is stored on disk

### Requirement: Cache MCP Tool Result Images
The `ImageCache` system SHALL accept and store images originating from MCP tool results in addition to user-uploaded images. The existing content-addressable storage and deduplication mechanisms SHALL apply identically.

#### Scenario: MCP tool image cached
- **WHEN** `ImageCache.put()` is called with an `ImageContent` object originating from an MCP tool result
- **THEN** the image SHALL be resized (if larger than 480px height), compressed to JPEG quality 85, and stored in `~/.dscode/data/images/`
- **AND** an `ImageRef` SHALL be returned with the content hash filename

#### Scenario: Duplicate MCP image deduplicated
- **WHEN** an MCP tool returns the same image content as a previously cached image
- **THEN** the cache SHALL reuse the existing file (no duplicate storage)
- **AND** return the same `ImageRef` with the existing hash

## ADDED Requirements

### Requirement: ImageCache re-exported from ImagePipeline
The `ImagePipeline` module SHALL re-export `ImageCache` from `src/image-pipeline/cache.ts` for consumers that need direct cache access. Existing imports of `ImageCache` from `src/utils/image-cache.ts` SHALL continue to work via a re-export shim during migration.

#### Scenario: ImageCache accessible via ImagePipeline
- **WHEN** a consumer imports `ImageCache` from `src/image-pipeline/index.js`
- **THEN** it receives the same `ImageCache` class as before

#### Scenario: Old import path works during migration
- **WHEN** a consumer imports from `src/utils/image-cache.js`
- **THEN** it SHALL re-export from `src/image-pipeline/cache.js` until all consumers are migrated
