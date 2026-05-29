## Why

当前 session 管理中，`agent.state.messages` 同时承载两个职责：(1) 主模型推理的上下文，(2) UI 展示的用户消息。在 vision pipeline 场景下，主模型收到的是纯文本（`<image_description>` 描述），而用户期望看到的是原始图片。这两种需求冲突——模型需要文本描述来保持上下文连贯，用户需要看到图片而非机器生成的文本。

这导致：
- 模型上下文不完整（描述被剥离后，下一轮推理失忆）
- UI 展示了不该展示的机器描述文本
- 用户图片变成了 `(no content)` 或描述文本

## What Changes

引入**数据层（Inference）与展示层（Display）的分离**：

- **数据层（`agent.state.messages`）**：始终保存模型实际收到的内容（vision 管道时为含 `<image_description>` 的 enriched text），不注入图片 base64。这是模型上下文的核心。
- **展示层（`buildConversationHistory` / TUI `replayMessages`）**：通过 `visionMessages[].messageIndex` 关联图片到对应消息，剥离描述，恢复图片 base64 供渲染。
- `harness.ts` 中 `promptWithImages` 不再修改 `agent.state.messages`，仅记录 `visionMessages` 并保存会话。
- `loadSession` 不再剥离描述，完整的推理上下文保持不变，图片恢复在展示层完成。

## Capabilities

### New Capabilities

- `mmvp-data-display-layer`: 数据层与展示层的清晰分离架构，定义各自的职责和交互接口

### Modified Capabilities

- `image-session`: Vision 调用日志的展示层恢复逻辑（原在 session/manager 中，现移至各 UI 后端的展示层）
- `session-management`: `SerializedSession.messages` 不包含 `images` 字段（模型未接收图片），`visionMessages` 独立存储图片引用

## Impact

- **`src/core/harness.ts`**：`promptWithImages` 移除消息修改逻辑，只记录 `visionMessages`
- **`src/session/manager.ts`**：`saveSession` 移除图片剥离/注入逻辑；`loadSession` 保持原始 content，不恢复图片
- **`src/ui/web/web-backend.ts`**：`buildConversationHistory` 作为展示层，通过 `visionMessages` 恢复图片
- **`src/ui/tui-app.ts` / `conversation.ts`**：`replayMessages` 作为展示层，通过 `visionMessages` 恢复图片
- **`src/session/types.ts`** (新文件): 数据层类型集中管理（从 `core/types.ts` 迁出 `ImageRef`, `VisionMessage`, `SessionMetadata`, `SerializedSession`）
- **`src/session/display.ts`** (新文件): 展示层统一重建函数 `rebuildDisplayMessages()`

- **`src/ui/web/protocol.ts`**：`ServerEvent.ready.messages` 保持 `ConversationMessage[]` 类型不变
