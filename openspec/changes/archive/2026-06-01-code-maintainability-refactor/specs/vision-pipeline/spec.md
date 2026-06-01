## MODIFIED Requirements

### Requirement: Vision Call Logging
When vision model is used to describe images, the system SHALL log the call details into the session. The vision model call SHALL be made through `ImagePipeline.process()`, which handles logging internally.

#### Scenario: Vision model invoked
- **WHEN** `ImagePipeline.process()` calls the vision model successfully
- **THEN** the system SHALL create a `VisionMessage` with: input `ImageRef[]`, `description` text, `modelProvider`, `modelId`, `timestamp`, `turnIndex`
- **AND** append it to a `visionMessages` array in the session

#### Scenario: Vision model failure
- **WHEN** `ImagePipeline.process()` vision call fails
- **THEN** the system SHALL NOT create a `VisionMessage` entry (no partial log)
- **AND** proceed to OCR fallback as before

### Requirement: Image Caching Before Vision Call
Before sending images to the vision model, the system SHALL first cache them through ImagePipeline's internal ImageCache.

#### Scenario: Cached images sent to vision
- **WHEN** images are sent to the vision model via `ImagePipeline.process()`
- **THEN** the system SHALL first pass them through `ImageCache.put()`
- **AND** use the cached (compressed) image data for the vision API call
- **AND** include the resulting `ImageRef[]` in the `VisionMessage` log

### Requirement: Vision/OCR Fallback for MCP Tool Result Images
When a tool result contains `ImageContent` blocks and the main model does not support image inputs, the system SHALL use `ImagePipeline.process()` which handles the vision-model-then-OCR chain uniformly for both user-uploaded and MCP tool-result images.

#### Scenario: Main model supports images natively
- **WHEN** an MCP tool result contains image content AND the resolved main model's `input` array includes `"image"`
- **THEN** the image data SHALL pass through to the model transcript unchanged
- **AND** no vision model or OCR call SHALL be made

#### Scenario: Vision model configured and available
- **WHEN** an MCP tool result contains image content AND the main model's `input` does NOT include `"image"` AND a vision model is configured
- **THEN** the system SHALL call `ImagePipeline.process()` with the image data
- **AND** replace the `ImageContent` blocks in the result with `TextContent` containing the vision model's description
- **AND** log a `VisionMessage` entry with the cached `ImageRef[]` and description

#### Scenario: Vision model fails, fall back to OCR
- **WHEN** the vision model call within `ImagePipeline.process()` fails for MCP tool images
- **THEN** the system SHALL attempt OCR on the image data
- **AND** replace `ImageContent` blocks with OCR-extracted text if useful text is found
- **AND** if OCR finds no useful text, keep a placeholder note

#### Scenario: Neither vision model nor OCR available
- **WHEN** neither vision model nor OCR is configured or both fail
- **THEN** the system SHALL preserve the original result content with `ImageContent` blocks intact
- **AND** prepend a `TextContent` note: `"Tool returned N image(s). The current model cannot view images. Consider configuring a vision model."`

### Requirement: MCP Tool Images Cached Before Vision Call
Before sending MCP tool result images to the vision model, the system SHALL first cache them through ImagePipeline's internal ImageCache.

#### Scenario: MCP image cached before vision call
- **WHEN** MCP tool result images are sent to the vision model via `ImagePipeline.process()`
- **THEN** the system SHALL first pass each image through `ImageCache.put()`
- **AND** use the cached (compressed) image data for the vision API call
- **AND** include the resulting `ImageRef[]` in the `VisionMessage` log
