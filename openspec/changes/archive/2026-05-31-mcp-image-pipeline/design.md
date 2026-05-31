## Context

当前 MCP 工具返回的结果通过 `extractToolResultText()` 转为纯文本字符串，`MCPImageContent` 被替换为 `[Image: mimeType]` 占位符。随后 `buildAgentTool().execute` 只将文本放入 `AgentToolResult.content`，图片数据完全丢失。

`AgentToolResult.content` 类型签名为 `(TextContent | ImageContent)[]`，pi-agent-core 的 `createToolResultMessage()` 直接将此 content 写入 `ToolResultMessage.content`，并通过 `defaultConvertToLlm` 传递给 LLM provider。这意味着修复只需在 MCP → Agent 边界保留 ImageContent，下层自动就绪。

现有的图片处理 pipeline（`harness.ts:promptWithImages`）仅在用户输入阶段介入（vision model → OCR 降级链）。MCP 工具结果中的图片不受此 pipeline 保护。

## Goals / Non-Goals

**Goals:**
- MCP 工具返回的 `MCPImageContent` 保留 base64 数据，写入 `AgentToolResult.content`
- `afterToolCall` hook 拦截含图片的工具结果，实施 vision/OCR fallback
- Web UI `ToolCard` 和 TUI `ConversationView` 正确渲染工具结果中的图片
- 图片通过 `ImageCache` 缓存管理

**Non-Goals:**
- 不改变 pi-agent-core 的 agent-loop 行为
- 不处理 MCP `AudioContent`（音频不在范围内）
- 不改变用户上传图片的现有 pipeline（`promptWithImages`）
- 不引入新的 MCP 协议版本或扩展

## Decisions

### Decision 1: 重构 `extractToolResultText` 为结构化函数

**选择**: 将 `extractToolResultText` 拆分为两个职责：(a) 提取文本部分用于 UI 预览，(b) 构建 `AgentToolResult.content` 数组（包含 TextContent + ImageContent）。

**替代方案**: 在 `buildAgentTool.execute` 中直接访问 `result.content`。  
**拒绝原因**: 耦合度过高，且 `details.mcpResult` 对 UI 和日志仍有价值。保留 wrapper 模式但让 content 数组正确包含 ImageContent。

**实现**:
```typescript
// 新函数签名
function buildToolResultContent(result: MCPToolResult): (TextContent | ImageContent)[] {
  const items: (TextContent | ImageContent)[] = [];
  for (const item of result.content ?? []) {
    if (item.type === "text" && item.text) {
      items.push({ type: "text", text: item.text });
    } else if (item.type === "image" && item.data) {
      items.push({ type: "image", data: item.data, mimeType: item.mimeType ?? "image/png" });
    }
  }
  return items;
}
```

### Decision 2: 利用 `afterToolCall` hook 实现 vision/OCR fallback

**选择**: 在 `harness.ts` 中注册 `afterToolCall`，检测 `result.content` 是否包含 `ImageContent`，若包含且主模型不支持 `image` 输入，则按现有优先级链回退。

**优先级链**（复用 `promptWithImages` 逻辑）:
1. 主模型支持 image → 不做处理，图片原样传给模型
2. vision model 已配置 → 调用 `describeImagesViaVisionModel`，将描述文本注入原 content
3. 都不满足 → 调用 `ocrImages`，注入 OCR 文本
4. OCR 也失败 → 保留原文 + `[Image: ...]` 提示

**替代方案**: 在 `buildAgentTool.execute` 内直接做 fallback。  
**拒绝原因**: `execute` 无访问 vision config / API key 的途径，且同步执行 OCR 会阻塞工具返回。`afterToolCall` 是异步钩子，设计上就是为此类横切关注点准备的。

### Decision 3: ToolCallEntry / ServerEvent 增加 images 字段

**选择**: 扩展 `ToolCallEntry` 和 `ServerEvent.tool_end` 增加 `images?: ImageAttachment[]`，携带工具结果中的图片数据。Web UI `ToolCard` 直接从该字段渲染，移除当前的 text-regex 提取逻辑。

**TUI 端**: `ConversationView.toolEnd` 接收原始 `result` object（而非 string），从中提取 `ImageContent` 并调用 `addInlineImage()`。

**类型变更**（`src/ui/shared/types.ts`）:
```typescript
export interface ToolCallEntry {
  name: string;
  args: string;
  result: string;
  isError: boolean;
  images?: ImageAttachment[];  // NEW
  mcpApp?: McpAppInfo;
}

// ServerEvent.tool_end
{ type: "tool_end"; name: string; result: string; isError: boolean; images?: ImageAttachment[] }
```

### Decision 4: 图片大小限制

**选择**: MCP 工具返回的图片在进入 Agent transcript 或发送给 UI 之前，必须通过 `ImageCache.put()` 压缩：高度上限 480px（不放大），JPEG quality 85，content-addressed storage。此约束与现有 `image-cache` spec 完全一致，适用于用户上传图片和 MCP 工具图片。超过 5MB 的原始图片在压缩后自然减小；如压缩失败则 fallback 到原始数据。

## Risks / Trade-offs

- **[Token 消耗]**: 图片 base64 直接传入模型 transcript 会大幅消耗 context window → Mitigation: `contextManager.transform` 已存在的 compaction 逻辑会在 context 超限时裁剪；vision/OCR fallback 在大部分场景下将图片转为文本，避免 base64 进入 transcript
- **[TUI 终端兼容]**: 不支持 Kitty/iTerm 图片协议的终端无法 inline 渲染 → Mitigation: `ConversationView.addInlineImage` 已有 fallback（保存到文件并显示路径）
- **[图片重复]**: 同一工具多次返回相同图片浪费 token → Mitigation: `ImageCache` 的 content-hash 去重

## Open Questions

1. vision model 调用是否需要使用压缩后的缓存图片（`ImageCache`）以减少 token 消耗？当前 `describeImagesViaVisionModel` 传原始 ImageContent，建议改为传压缩版。
