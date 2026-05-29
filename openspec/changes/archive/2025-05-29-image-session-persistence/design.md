## Context

当前会话管理(`session/manager.ts`)只保存主模型(`agent.state.messages`)的对话，当用户上传图片时：

- 如果主模型原生支持图片（如 qwen-vl）→ 图片以 `ImageContent` (base64) 内联在 messages 中保存 → 正常工作
- 如果主模型不支持图片，但配置了 vision 模型 → `harness.ts` 中 `describeImagesViaVisionModel()` 调用 vision 模型获取文本描述，然后将描述文本发给主模型 → **原始图片丢失，vision 调用过程不记录**
- 如果 OCR 回退 → 同上，只保存 OCR 文本 → **图片丢失**

数据流：

```
用户上传图片 (base64)
  → promptWithImages(text, images)
     ├─ 主模型支持 → agent.state.messages 中保存 base64  → ✓ 可恢复
     ├─ Vision 模型  → description → agent.state.messages 中只存文本 → ✗ 图片丢失
     └─ OCR 回退     → ocrText    → agent.state.messages 中只存文本 → ✗ 图片丢失
```

核心约束：
- Session 文件不应无限制膨胀（base64 图片可能数 MB）
- 重新加载 session 时应能恢复图片显示
- Vision 模型调用信息需要存档以备后续展示
- 向后兼容已有 version 1 的 session 文件

## Goals / Non-Goals

**Goals:**
- 用户上传图片时压缩并写入磁盘缓存，session 只存储缓存引用
- Session 版本升级到 v2，支持图片引用和 vision 日志
- V1 session 向后兼容（加载时不报错，但无图片）
- Vision 模型调用日志（输入图片引用 + 输出描述 + 模型信息）持久化到 session
- Session 加载时如果缓存文件存在则恢复图片，丢失则显示占位

**Non-Goals:**
- Session 文件之间的图片共享去重（hash 寻址本身已去重，但不做跨 session 的 GC）
- 缓存的自动清理策略（本轮不做，后续可加 TTL 或 LRU）
- 图片 OCR 结果在 session 中的展示变更（OCR 依旧转为文本）
- TUI 中的图片显示（TUI 终端受限，保持现有行为）

## Decisions

### D1: 使用 `sharp` 进行图片压缩

**决定**: 引入 `sharp` 作为图片处理依赖。

**理由**:
- Node.js 生态中最成熟的图片处理库，性能极佳（libv8 绑定）
- 相比纯 JS 方案（jimp），压缩速度快 10-50 倍
- 广泛使用，社区稳定，TypeScript 类型支持好
- Vision 模型按 tokens 计费，压缩到 height=480 能显著节省开销

**备选方案**: `jimp`（纯 JS，零 native 依赖）→ 排除因为压缩大量图片时性能差距明显

### D2: 缓存目录为 `~/.dscode/data/images/`，全局共享

**决定**: 使用全局缓存目录 `~/.dscode/data/images/`，不区分项目。

**理由**:
- 内容寻址（图片 content hash 为文件名）天然去重，同一张图片在不同项目中使用只存一份
- 复用现有 `config.ts` 中的 `dsDataHome()` 路径逻辑
- 不需要项目级隔离（图片本身就是跨项目可复用的）

**文件名格式**: `<sha256_prefix_16>.jpg`（16 字符，collision 概率极低）

### D3: Session 消息升级为 ImageRef 引用而非内联 base64

**决定**: `SerializedSession` version 从 1 升级到 2，消息中图片字段改为引用格式。

```typescript
// V1 (现有)
messages[].content → [{ type: "image", data: "base64...", mimeType: "..." }]

// V2 (新)
interface ImageRef {
  type: "image_ref";
  hash: string;       // 缓存文件名 (如 "a1b2c3d4e5f6a7b8.jpg")
  mimeType: string;   // 如 "image/jpeg"
}

// messages[].images → ImageRef[]
// 同时保留原始 content 结构不变（text 部分）
```

**理由**:
- Session 文件体积大幅缩小（引用 ≈ 80 字节 vs base64 ≈ 数 MB）
- 内容寻址天然去重
- 读取 session 时按需加载，非一次性全部读入内存

**风险**: 缓存文件可能被删除 → 加载时显示占位，不崩溃

### D4: Vision 调用日志结构设计

**决定**: Vision 日志设计为松耦合的扩展结构，预留展示字段。

```typescript
interface VisionMessage {
  turnIndex: number;          // 对应主模型第几次用户轮次 (0-based)
  images: ImageRef[];         // 输入的图片引用
  prompt: string;             // 发给 vision 模型的 prompt
  description: string;        // vision 模型返回的描述文本
  modelProvider: string;      // 如 "openai"
  modelId: string;            // 如 "gpt-4o"
  timestamp: number;          // 调用时间
  latencyMs?: number;         // 耗时（可选，预留）
  tokensUsed?: number;        // token 消耗（可选，预留）
}
```

**理由**:
- `turnIndex` 提供了与主模型会话的关联锚点
- 所有字段均为未来展示做准备但不强制展示
- `latencyMs` 和 `tokensUsed` 以 optional 形式预留
- `timestamp` 可用于时间轴展示

### D5: Session Store 做 V1/V2 兼容

**决定**: `store.ts` 的 `validateSession()` 同时接受 version 1 和 version 2。

- V1 → 正常加载，`hasImages: false`
- V2 → 正常加载，含图片引用和 vision 日志
- V2 写回时始终保持 version=2

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| `sharp` 安装失败（native binding 编译问题） | 在 package.json 中列为 peerDependency，首次运行检测并提示 |
| 缓存文件被用户误删 | Session 加载时检查文件存在性，不存在则显示占位，不崩溃 |
| Session 文件增大（vision 日志累积） | Vision 日志精简设计，只存必要字段，不存完整 base64 |
| 压缩 height=480 可能丢失细微文字信息 | OCR / Vision 模型调用发生在压缩前（虽然给 vision 模型的是压缩后的，但压缩到 480px 对文字识别影响极小） |

## Migration Plan

1. 新增 `image-cache.ts`（纯新增，无迁移）
2. 修改 `core/types.ts`：新增 ImageRef、VisionMessage 类型；修改 SessionMetadata、SerializedSession
3. 修改 `session/store.ts`：validateSession 兼容 V1/V2
4. 修改 `session/manager.ts`：saveSession 中图片转引用；loadSession 中恢复
5. 修改 `core/harness.ts`：promptWithImages 中插入缓存；vision 调用后记录日志
6. 修改 `ui/web/web-backend.ts`：buildConversationHistory 中通过 ImageRef 读取缓存
7. 已有 V1 session 文件不受影响（只读兼容）
8. 安装 `sharp` 依赖

## Open Questions

- `sharp` 是否用 `optionalDependencies` 来避免安装失败导致整个包不可用？— 是，因为图片缓存是可选的优雅特性，非核心功能
