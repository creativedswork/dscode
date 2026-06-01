## MODIFIED Requirements

### Requirement: MCP Image Content Preservation
The system SHALL preserve base64 image data from MCP tool results into `AgentToolResult.content` as `ImageContent` blocks, instead of replacing them with text placeholders. Image processing (compression, vision description) SHALL be delegated to `ImagePipeline.process()`.

#### Scenario: MCP tool returns image content
- **WHEN** an MCP tool returns `{ content: [{ type: "image", data: "<base64>", mimeType: "image/png" }] }`
- **THEN** the `AgentToolResult.content` array SHALL contain `{ type: "image", data: "<base64>", mimeType: "image/png" }`
- **AND** the image data SHALL flow through into the agent transcript via `ToolResultMessage.content`
- **AND** the image SHALL also be processed by `ImagePipeline.process()` for vision/OCR description

#### Scenario: MCP tool returns mixed text and image content
- **WHEN** an MCP tool returns `{ content: [{ type: "text", text: "Results:" }, { type: "image", data: "<base64>", mimeType: "image/png" }] }`
- **THEN** the `AgentToolResult.content` array SHALL contain both the text and image blocks in original order

#### Scenario: MCP tool returns text-only content
- **WHEN** an MCP tool returns only text content blocks
- **THEN** the system SHALL behave exactly as before (backward compatible)

#### Scenario: MCP tool returns result without content array
- **WHEN** an MCP tool returns a result that is not a structured `MCPToolResult` (bare string or unknown shape)
- **THEN** the system SHALL fall back to `JSON.stringify` for the content array

### Requirement: MCP Tool Image Size Compression
Before entering the agent transcript or being sent to the UI, MCP tool result images SHALL be compressed using `ImagePipeline`'s internal `ImageCache`: max height 480px, JPEG quality 85, content-addressed storage.

#### Scenario: Large MCP image compressed
- **WHEN** an MCP tool returns an image with height > 480px
- **THEN** the system SHALL pass it through `ImageCache.put()` (via ImagePipeline) before adding to `AgentToolResult.content`
- **AND** the `AgentToolResult.content` SHALL contain the compressed (cached) image data, not the original high-resolution data

#### Scenario: Small MCP image preserved
- **WHEN** an MCP tool returns an image with height ≤ 480px
- **THEN** the system SHALL still pass it through `ImageCache.put()` for deduplication
- **AND** the cached (possibly re-encoded) version SHALL be used in `AgentToolResult.content`

#### Scenario: Image compression fails
- **WHEN** `ImageCache.put()` fails for any reason (e.g., sharp unavailable, corrupt data)
- **THEN** the system SHALL fall back to using the original (uncompressed) image data
- **AND** log the error

### Requirement: Tool Result Image Display in Web UI
The Web UI `ToolCard` SHALL render inline images from MCP tool results using structured `ImageAttachment` data rather than regex-extracting from text.

#### Scenario: Tool result contains image
- **WHEN** a `tool_end` event includes `images: [{ data: "<base64>", mimeType: "image/png" }]`
- **THEN** the `ToolCard` SHALL render the image as an `<img>` element with `src="data:image/png;base64,..."`
- **AND** clicking the image SHALL open it in a new tab at full resolution

#### Scenario: Tool result has no images
- **WHEN** a `tool_end` event has no `images` field or an empty array
- **THEN** the `ToolCard` SHALL render the text result exactly as before (no UI regression)

#### Scenario: Multiple images in tool result
- **WHEN** a `tool_end` event includes multiple `ImageAttachment[]` entries
- **THEN** the `ToolCard` SHALL display all images in a flex-wrap row

### Requirement: Tool Result Image Display in TUI
The TUI `ConversationView` SHALL render inline images from MCP tool results using the existing `addInlineImage` method.

#### Scenario: TUI terminal supports image protocol
- **WHEN** a tool result contains image data AND `getCapabilities().images` is true
- **THEN** the TUI SHALL render the image using the `@earendil-works/pi-tui` `Image` component

#### Scenario: TUI terminal does not support images
- **WHEN** a tool result contains image data AND `getCapabilities().images` is false
- **THEN** the TUI SHALL save the image to `~/.dscode/image-cache/` and display the file path

### Requirement: ToolCallEntry and ServerEvent Image Extension
The `ToolCallEntry` type and `tool_end` server event SHALL carry an optional `images` field of type `ImageAttachment[]`.

#### Scenario: Web backend emits tool_end with images
- **WHEN** `WebUiBackend.toolEnd()` is called with a result containing image data
- **THEN** the broadcasted `ServerEvent` SHALL include `images: ImageAttachment[]` field

#### Scenario: TUI backend passes image data
- **WHEN** `TuiBackend.toolEnd()` delegates to `TuiApp.toolEnd()`
- **THEN** the conversation view SHALL receive image attachment data for rendering
