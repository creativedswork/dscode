## Context

当前架构中 `agent.state.messages` 是唯一的会话数据源，既作为主模型的推理上下文，又直接渲染给用户。在 vision pipeline 场景下出现根本冲突：

```
用户发送: "这是什么" + 📷
  ├─ Vision 模型 → 描述 = "一只猫在椅子上"
  ├─ 主模型收到: "这是什么\n<image_description>一只猫在椅子上</image_description>"
  ├─ agent.state.messages[i].content = enriched text (含描述)
  └─ agent.state.messages[i].images = ??? ← 不知道该放什么
```

如果 `images` 放 base64 → 模型收到图片+文本（image-supporting 模型才需要，非 image 模型会混乱）
如果 `images` 不放 → 用户看不到图片
如果 `content` 剥离描述 → 模型下一轮推理丢失上下文（失忆）

核心矛盾：**一条消息需要两种不同的表现形式。**

## Goals / Non-Goals

**Goals:**
- `agent.state.messages` 严格反映模型实际收到的内容（数据层）
- 展示层（Web UI `buildConversationHistory` / TUI `replayMessages`）通过 `visionMessages` 恢复图片供渲染
- `loadSession` 后模型上下文完整（含 vision 描述），无需重跑 vision 模型
- `visionMessages` 满足存档需求，结构设计便于未来展示

**Non-Goals:**
- 改变 `agent.state.messages` 的序列化格式（v1/v2 不动）
- 在 `SerializedSession` 新增顶层字段
- 前端适配 TUI（本次只修复 Web UI 的展示层）

## Decisions

### D1: 数据层与展示层分离架构

```
┌─── Data Layer: agent.state.messages ──────────────────┐
│  messages[i].content = enriched text (含描述)           │
│  messages[i].images  = undefined                        │
│  → 用于模型推理                                         │
│  → 序列化到 session (version 2)                         │
└───────────────────────────────────────────────────────┘
                         │
                         ▼
┌─── Link Layer: visionMessages ────────────────────────┐
│  visionMessages[i].messageIndex → 关联到 messages[j]    │
│  visionMessages[i].images = ImageRef[]                  │
│  → 存档，不直接渲染                                      │
└───────────────────────────────────────────────────────┘
                         │
                         ▼
┌─── Display Layer: buildConversationHistory ────────────┐
│  1. 遍历 visionMessages                                 │
│  2. 找到 messages[vm.messageIndex]                      │
│  3. content.replace(/<image_description>.../g, "").trim()│
│  4. ImageCache.get() → base64 → ImageAttachment[]       │
│  5. 返回 { content: cleaned, images: base64[] }         │
└───────────────────────────────────────────────────────┘
```

**理由：**
- `agent.state.messages` 保持纯净——只存模型收到的内容
- `visionMessages` 作为 bridge，链接推理数据到展示数据
- 展示层独立，随时可改，不影响模型推理

### D2: harness.ts 不再修改 agent.state.messages

在 `promptWithImages` vision 路径中，不再做任何 `userMsg.content = text` / `userMsg.images = ...` 的修改。只：
1. 调用 `promptAndSave(enrichedText)` → 模型推理
2. 记录 `VisionMessage { messageIndex, images, description }` → 保存
3. `trySaveSession()` → 持久化

**备选方案**：在 prompt 之后修改 content 为原始文本、注入 images。被否决因为：
- 修改 content 破坏模型上下文（下一轮推理时失忆）
- 注入 images 到 agent.state.messages 混淆数据模型（模型实际未收到图片）
- 需要二次 saveSession

### D3: 展示层通过 visionMessages 重建

Web UI 的 `buildConversationHistory` 和 TUI 的 `replayMessages` 各自承担展示层职责：

```
buildConversationHistory(messages, visionMessages):
  for each message i:
    content = messages[i].content
    images = undefined
    
    // 检查是否有 vision 关联
    for each vm in visionMessages:
      if vm.messageIndex === i:
        content = stripDescription(content)
        images = restoreImages(vm.images)
    
    return { role, content, images }
```

**理由：**
- 展示逻辑完全独立，不污染数据层
- TUI 和 Web UI 各自按需要实现（TUI 可能有终端限制）
- 换模型/换前端不影响架构

### D4: `SerializedSession` 不新增字段

`visionMessages` 已作为 `SerializedSession` 的可选字段存在（在 image-session-persistence 中已添加）。本次只修改其语义：
- 之前：保存了但不知道何时使用
- 之后：作为展示层的桥梁数据

### D5: 独立的数据层文件 `src/session/types.ts` + `src/session/display.ts`

当前所有 session 相关类型散落在 `src/core/types.ts` 和 `src/ui/shared/types.ts`。引入专用数据层：

```
src/session/
  ├── types.ts      ← 数据层类型
  │   ImageRef, VisionMessage, SessionMetadata, SerializedSession
  │
  ├── display.ts    ← 展示层：统一的消息重建
  │   rebuildDisplayMessages(messages, visionMessages) → DisplayMessage[]
  │   Web UI buildConversationHistory / TUI replayMessages 共用
  │
  ├── store.ts      ← 不变
  └── manager.ts    ← 不变
```

`DisplayMessage` 是展示层专用类型：
```typescript
interface DisplayMessage {
  role: "user" | "assistant" | "system";
  content: string;             // 剥离描述后的文本
  images?: ImageAttachment[];  // 从 visionMessages 恢复的 base64 图片
  thinking?: string;
  tools?: ToolCallEntry[];
}
```

**理由**：数据层类型独立，不混入 config/driver/skill/UI 类型；`rebuildDisplayMessages` 单一函数供 Web UI 和 TUI 共同调用。


## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 展示层和推理层不同步（visionMessages 丢失关联） | `messageIndex` 是精确索引，session 文件是原子保存 |
| 多轮对话中 messageIndex 漂移 | `messageIndex` 只在 `promptAndSave` 后立即记录，不会被上下文压缩改变 |
| TUI 展示图片在终端受限 | TUI 保持现有行为（文字为主），不作为本次范围 |
