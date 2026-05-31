## ADDED Requirements

### Requirement: Vision/OCR Fallback for MCP Tool Result Images

When a tool result contains `ImageContent` blocks and the main model does not support image inputs, the system SHALL fall back through the same vision-model-then-OCR chain used for user-uploaded images.

#### Scenario: Main model supports images natively
- **WHEN** an MCP tool result contains image content AND the resolved main model's `input` array includes `"image"`
- **THEN** the image data SHALL pass through to the model transcript unchanged
- **AND** no vision model or OCR call SHALL be made

#### Scenario: Vision model configured and available
- **WHEN** an MCP tool result contains image content AND the main model's `input` does NOT include `"image"` AND a vision model is configured in `HarnessConfig.vision`
- **THEN** the system SHALL call `describeImagesViaVisionModel()` with the image data
- **AND** replace the `ImageContent` blocks in the result with `TextContent` containing the vision model's description
- **AND** log a `VisionMessage` entry with the cached `ImageRef[]` and description

#### Scenario: Vision model fails, fall back to OCR
- **WHEN** the vision model call for MCP tool images fails
- **THEN** the system SHALL attempt `ocrImages()` on the image data
- **AND** replace `ImageContent` blocks with OCR-extracted text if useful text is found
- **AND** if OCR finds no useful text, keep a placeholder note

#### Scenario: Neither vision model nor OCR available
- **WHEN** neither vision model nor OCR is configured or both fail
- **THEN** the system SHALL preserve the original result content with `ImageContent` blocks intact
- **AND** prepend a `TextContent` note: `"Tool returned N image(s). The current model cannot view images. Consider configuring a vision model."`

### Requirement: MCP Tool Images Cached Before Vision Call

Before sending MCP tool result images to the vision model, the system SHALL first cache them through `ImageCache`.

#### Scenario: MCP image cached before vision call
- **WHEN** MCP tool result images are sent to the vision model
- **THEN** the system SHALL first pass each image through `ImageCache.put()`
- **AND** use the cached (compressed) image data for the vision API call
- **AND** include the resulting `ImageRef[]` in the `VisionMessage` log
