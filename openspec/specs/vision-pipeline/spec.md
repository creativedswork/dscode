## Purpose

Vision model orchestration — image caching, Vision Agent execution, and OCR fallback.
## Requirements
### Requirement: Vision Call Logging
When the Vision Agent processes images, the system SHALL write a generic child Agent record to the parent session and a complete execution record to AgentProcessStore.

#### Scenario: Vision model invoked
- **WHEN** the Vision Agent calls the configured model successfully
- **THEN** the parent session SHALL contain an `agentMessages` entry with `role: "subagent"`, the Vision Agent ID, image attachments, prompt, output, and message association
- **AND** the session SHALL NOT receive a new `visionMessages` entry

#### Scenario: Vision model failure
- **WHEN** the Vision Agent model call fails
- **THEN** the same Agent process SHALL proceed to OCR fallback
- **AND** its final state and execution source SHALL be persisted in the same generic `agentMessages` record

### Requirement: Image Caching Before Vision Call
Before sending images to the vision model, the system SHALL first cache them through ImagePipeline's internal ImageCache.

#### Scenario: Cached images sent to vision
- **WHEN** images are sent to the vision model via `ImagePipeline.process()`
- **THEN** the system SHALL first pass them through `ImageCache.put()`
- **AND** use the cached (compressed) image data for the vision API call
- **AND** include the resulting `ImageRef[]` in the Vision Agent's generic input attachments


### Requirement: Vision/OCR Fallback for MCP Tool Result Images
When a tool result contains `ImageContent` blocks and the main model does not support image inputs, the system SHALL use `ImagePipeline.process()` which handles the vision-model-then-OCR chain uniformly for both user-uploaded and MCP tool-result images. The process call SHALL include an `AbortSignal` when available from the caller context.

#### Scenario: Main model supports images natively
- **WHEN** an MCP tool result contains image content AND the resolved main model's `input` array includes `"image"`
- **THEN** the image data SHALL pass through to the model transcript unchanged
- **AND** no vision model or OCR call SHALL be made

#### Scenario: Vision model configured and available
- **WHEN** an MCP tool result contains image content AND the main model's `input` does NOT include `"image"` AND a vision model is configured
- **THEN** the system SHALL call `ImagePipeline.process()` with the image data
- **AND** replace the `ImageContent` blocks in the result with `TextContent` containing the vision model's description
- **AND** log an `AgentSessionMessage` entry with the cached `ImageRef[]` and description

#### Scenario: Vision model fails, fall back to OCR
- **WHEN** the vision model call within `ImagePipeline.process()` fails for MCP tool images
- **THEN** the system SHALL attempt OCR on the image data
- **AND** replace `ImageContent` blocks with OCR-extracted text if useful text is found
- **AND** if OCR finds no useful text, keep a placeholder note

#### Scenario: Neither vision model nor OCR available
- **WHEN** neither vision model nor OCR is configured or both fail
- **THEN** the system SHALL preserve the original result content with `ImageContent` blocks intact
- **AND** prepend a `TextContent` note: `"Tool returned N image(s). The current model cannot view images. Consider configuring a vision model."`

#### Scenario: Abort signal propagated through MCP tool path
- **WHEN** `ImagePipeline.process()` is called from MCP tool result handling with an `AbortSignal`
- **THEN** the signal SHALL be passed through to vision model and OCR calls
- **AND** if aborted, the error SHALL propagate to the caller without producing a `ProcessResult`


### Requirement: MCP Tool Images Cached Before Vision Call
Before sending MCP tool result images to the vision model, the system SHALL first cache them through ImagePipeline's internal ImageCache.

#### Scenario: MCP image cached before vision call
- **WHEN** MCP tool result images are sent to the vision model via `ImagePipeline.process()`
- **THEN** the system SHALL first pass each image through `ImageCache.put()`
- **AND** use the cached (compressed) image data for the vision API call
- **AND** include the resulting `ImageRef[]` in the Vision Agent's generic input attachments
