## Why

MCP 工具返回的 base64 图片内容（如截图工具、图表生成工具）在当前链路中无法被模型感知，也无法在 Web UI 和 TUI 中渲染。`extractToolResultText()` 将图片数据替换为 `[Image: xxx]` 文本占位，导致 base64 数据在进入 Agent 循环前就已丢失。现有的 vision model / OCR fallback 链路仅覆盖用户手动上传的图片，不覆盖 MCP 工具结果中的图片。

## What Changes

- **`extractToolResultText` + `buildAgentTool`** — 保留 MCP 返回的 `ImageContent`，直接塞入 `AgentToolResult.content` 数组（该类型已原生支持 `(TextContent | ImageContent)[]`）
- **`afterToolCall` hook** — 在 harness 中拦截包含图片的工具结果：若主模型不支持图片输入且配置了 vision model，则用 vision model 转为文本描述；否则 fallback 到 OCR；若两者都不可用，保留图片并附上 `[Image: ...]` 提示
- **Web UI `ToolCard`** — 从 `ToolCallEntry` 结构化的图片字段渲染 inline 图片，替代从文本 regex 提取的不可靠方式
- **TUI `ConversationView`** — `toolEnd` 中检测图片数据，调用已有的 `addInlineImage()` 展示
- **`ToolCallEntry` / `ServerEvent.tool_end`** — 增加 `images` 字段传递图片元数据

## Capabilities

### New Capabilities

- `mcp-image-tool-result`: MCP 工具返回的图片内容在 Agent 转录、模型推理、Web UI 和 TUI 中的完整端到端支持

### Modified Capabilities

- `vision-pipeline`: vision model / OCR fallback 从仅处理用户上传图片扩展为也处理 MCP 工具结果中的图片
- `image-cache`: 扩展缓存范围，也缓存 MCP 工具结果中的图片

## Impact

| 层次 | 文件 | 变更 |
|------|------|------|
| MCP 层 | `src/mcp/manager.ts` | `extractToolResultText` → 返回结构化 content 而非纯文本；`buildAgentTool` 中构建 `ImageContent` |
| Agent 层 | `src/core/harness.ts` | 新增或扩展 `afterToolCall` 钩子，实现 vision/OCR fallback |
| 类型层 | `src/ui/shared/types.ts` | `ToolCallEntry` 增加 `images` 字段；`ServerEvent.tool_end` 增加 images |
| TUI | `src/ui/conversation.ts` | `toolEnd` 方法检测并调用 `addInlineImage` |
| TUI | `src/ui/tui-app.ts`, `src/ui/tui-backend.ts` | 传递图片数据 |
| Web | `src/ui/web/web-backend.ts` | `toolEnd` 事件携带图片数据 |
| Web | `web/src/components/ToolCard.tsx` | 从结构化字段渲染 inline 图片，移除 text-regex 提取逻辑 |
| Specs | `openspec/specs/vision-pipeline/spec.md` | delta spec: 扩展为也覆盖 MCP 工具图片 |
| Specs | `openspec/specs/image-cache/spec.md` | delta spec: 缓存范围增加 MCP 工具图片 |
