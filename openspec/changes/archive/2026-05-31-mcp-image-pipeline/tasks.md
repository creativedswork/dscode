## 1. Core: MCP Tool Result Image Preservation

- [x] 1.1 Refactor `extractToolResultText` in `src/mcp/manager.ts` into two functions: `buildToolResultContent()` that returns `(TextContent | ImageContent)[]`, and `extractToolResultPreview()` for UI preview text
- [x] 1.2 Update `buildAgentTool()` to call `buildToolResultContent()` for `AgentToolResult.content`, and compress images > 480px height via `ImageCache.put()` before adding to content array
- [x] 1.3 Add check in `buildAgentTool()` to skip ImageContent in content array when `result.content` is undefined/null (fall back to JSON stringify)
- [x] 1.4 Fall back to original image data when `ImageCache.put()` fails (sharp unavailable, corrupt data)

## 2. Agent Layer: Vision/OCR Fallback for Tool Images

- [x] 2.1 Implement `afterToolCall` handler in `src/core/harness.ts` that detects ImageContent in `ctx.result.content`
- [x] 2.2 Implement vision model fallback path: check main model supports image → if not, check vision config → call `describeImagesViaVisionModel` or `resolveVisionModel`
- [x] 2.3 Implement OCR fallback path as secondary fallback after vision model failure
- [x] 2.4 Implement final fallback: prepend note text when neither vision nor OCR available
- [x] 2.5 Add `ImageCache.put()` integration before vision/OCR calls
- [x] 2.6 Log `VisionMessage` entries when vision model is used for MCP tool images

## 3. Shared Types: Image Support in ToolCallEntry and ServerEvent

- [x] 3.1 Add `images?: ImageAttachment[]` to `ToolCallEntry` in `src/ui/shared/types.ts`
- [x] 3.2 Add `images?: ImageAttachment[]` to `ServerEvent.tool_end` in `src/ui/shared/types.ts`

## 4. Web Backend: Pass Image Data in tool_end Events

- [x] 4.1 Update `WebUiBackend.toolEnd()` in `src/ui/web/web-backend.ts` to extract images from tool result and include in broadcasted `tool_end` event
- [x] 4.2 Update reducer to handle `images` field in `tool_end` event and store in `ToolCallEntry`

## 5. Web Frontend: Render Tool Result Images in ToolCard

- [x] 5.1 Update `ToolCard` in `web/src/components/ToolCard.tsx` to render images from `tool.images` structured field
- [x] 5.2 Add image expand toggle, click-to-open-full-resolution, and flex-wrap row layout for multiple images
- [x] 5.3 Remove text-based `extractImages()` regex logic (keep only for backwards compat with old sessions)

## 6. TUI: Render Tool Result Images

- [x] 6.1 Update `TuiBackend.toolEnd()` in `src/ui/tui-backend.ts` to pass original result object (not stringified) to `TuiApp`
- [x] 6.2 Update `TuiApp.toolEnd()` to receive both string result and image attachments
- [x] 6.3 Update `ConversationView.toolEnd()` in `src/ui/conversation.ts` to detect image data and call `addInlineImage()` for each image
- [x] 6.4 Update `ConversationView.finishAssistantMessage()` to render images in the final view (not just live preview)

## 7. Validation

- [x] 7.1 Run `npm run typecheck` to ensure zero type errors
- [ ] 7.2 Manual test: connect an MCP server that returns images, verify Web UI renders images inline
- [ ] 7.3 Manual test: verify TUI renders images (Kitty terminal) or shows file path (plain terminal)
- [ ] 7.4 Manual test: verify vision model fallback triggers when main model is text-only
- [ ] 7.5 Manual test: verify text-only MCP tools still work (no regression)
