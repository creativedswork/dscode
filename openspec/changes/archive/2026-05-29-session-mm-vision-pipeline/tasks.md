## 1. 数据层文件创建

- [x] 1.1 创建 `src/session/types.ts` — 集中管理数据层类型
  - 从 `src/core/types.ts` 迁出：`ImageRef`, `VisionMessage`, `SessionMetadata`, `SerializedSession`
  - `SessionMetadata` 保留 `hasImages`, `imageCount` 字段
- [x] 1.2 `src/core/types.ts` 从 `src/session/types.ts` re-export 以保持现有 import 兼容
- [x] 1.3 创建 `src/session/display.ts` — 展示层
  - 定义 `DisplayMessage` 接口：`{ role, content, images?, thinking?, tools? }`
  - 实现 `rebuildDisplayMessages(messages, visionMessages)` → `DisplayMessage[]`
    - 匹配 `visionMessages[].messageIndex`：剥离 `<image_description>`，从 `ImageCache.getSync()` 恢复图片
    - 无匹配：content 不变，inline image blocks 正常提取

## 2. harness.ts 清理

- [x] 2.1 `promptWithImages` vision 路径精简为三步：
  - `promptAndSave(enrichedText)`
  - 记录 `VisionMessage { messageIndex, images, ... }`
  - `trySaveSession()`
- [x] 2.2 删除所有 `userMsg.content` / `userMsg.images` 修改代码
- [x] 2.3 删除 `_displayImages` / `restoredImgs` 等残留代码

## 3. session/manager.ts 清理

- [x] 3.1 `loadSession`：删除 vision message 的图片注入到 `agent.state.messages` 的逻辑
- [x] 3.2 `saveSession`：删除对 `agent.state.messages` 图片的剥离/转换
- [x] 3.3 `visionMessages` 只通过 getter/setter 存取，不做额外处理

## 4. Web UI 展示层 — 使用 `rebuildDisplayMessages`

- [x] 4.1 `buildConversationHistory` 调用 `rebuildDisplayMessages(agent.state.messages, visionMessages)`
- [x] 4.2 调用处（`handleConnect`、session load replay）传入正确的 `visionMessages`
- [x] 4.3 删除旧的 inline image 提取 + 描述剥离逻辑（已由 display.ts 统一处理）

## 5. 验证

- [x] 5.1 `npm run typecheck` 通过
- [x] 5.2 `npm run build` 通过
- [x] 5.3 Web UI 对话流程验证
