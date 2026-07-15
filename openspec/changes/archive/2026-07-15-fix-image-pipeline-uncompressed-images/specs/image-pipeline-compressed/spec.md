## ADDED Requirements

### Requirement: ImagePipeline SHALL pass compressed cached images to vision model
After `ImageCache.put()` compresses all images and returns `cachedRefs`, the pipeline SHALL read the compressed images back via `ImageCache.get()` and pass the compressed `ImageContent[]` to `describeImagesViaVisionModel()` instead of the original uncompressed images.

#### Scenario: Large JPEG image goes through vision model with compressed data
- **WHEN** a user submits a 871KB JPEG image through TUI drag-and-drop
- **AND** sharp is available for compression
- **THEN** `ImageCache.put()` SHALL compress the image to ≤480px height PNG and cache it
- **AND** the pipeline SHALL read the compressed image back via `ImageCache.get()`
- **AND** the compressed image SHALL be passed to `describeImagesViaVisionModel()`
- **AND** the vision model SHALL receive the compressed PNG data, not the original 871KB JPEG base64

#### Scenario: Small image that doesn't need resize
- **WHEN** a user submits a small image (≤480px height)
- **AND** sharp is available
- **THEN** `ImageCache.put()` SHALL convert it to PNG without resizing
- **AND** the pipeline SHALL still pass the cached (converted) version to the vision model

### Requirement: ImagePipeline SHALL pass compressed cached images to OCR fallback
When the vision model call fails and the pipeline falls back to OCR, it SHALL pass the compressed `ImageContent[]` (read from cache via `ImageCache.get()`) to `ocrImages()` instead of the original uncompressed images.

#### Scenario: Vision model fails, OCR receives compressed image
- **WHEN** `describeImagesViaVisionModel()` throws an error or returns empty
- **AND** the pipeline enters the OCR fallback path
- **THEN** the compressed images from cache SHALL be passed to `ocrImages()`
- **AND** OCR SHALL run on the 480px PNG version, not the original high-resolution image

### Requirement: Readback failure SHALL fall back to original images
If any `ImageCache.get(cachedRef)` returns `null` (cache miss), the pipeline SHALL fall back to using the original uncompressed images for the downstream call.

#### Scenario: Cache file deleted between put and get
- **WHEN** `ImageCache.put()` succeeds and returns a valid `ImageRef`
- **BUT** the cached file is deleted from disk before `ImageCache.get()` reads it
- **THEN** `ImageCache.get()` SHALL return `null`
- **AND** the pipeline SHALL fall back to using the original `normalizedImages`
- **AND** the pipeline SHALL NOT crash or throw

#### Scenario: Sharp not available, original images used
- **WHEN** sharp is not installed
- **AND** `ImageCache.put()` stores the original uncompressed data
- **THEN** `ImageCache.get()` SHALL return the same uncompressed data
- **AND** the pipeline SHALL pass it to the vision model and OCR (no regression from current behavior)

### Requirement: Batch readback SHALL be parallel
All `ImageCache.get()` calls for a batch of images SHALL be issued in parallel via `Promise.all` before the first downstream call.

#### Scenario: Multiple images submitted together
- **WHEN** a user submits 3 images in a single message
- **AND** all 3 are compressed and cached by `ImageCache.put()`
- **THEN** all 3 SHALL be read back from cache in parallel via `Promise.all`
- **AND** the compressed array SHALL be passed to the vision model as a single batch
