## Why

当前 session 管理只记录主模型的对话消息，当用户上传图片且主模型不支持图片输入时（通过 vision 模型描述或 OCR 回退），原始图片数据和 vision 模型调用过程全部丢失。重新加载 session 后无法看到之前上传的图片，也无法追溯 vision 模型的分析结果。这造成信息不对称和会话不可回溯。

## What Changes

- 新增图片缓存层：用户上传的图片统一压缩至 height=480px（宽度等比缩放），写入 `~/.dscode/data/images/` 缓存目录，内容寻址（hash 文件名）天然去重
- Session 消息格式升级（version 1 → 2）：用户消息中的图片从内联 base64 改为缓存引用 `ImageRef`
- Session 元数据扩展：新增 `hasImages`、`imageCount` 字段
- Vision 模型调用链路记录：记录每次 vision 调用的输入（缓存图片引用）、输出（描述文本）、模型信息，关联到对应主模型对话轮次
- Session 加载时按缓存引用恢复图片显示：缓存文件存在则渲染，丢失则显示占位
- 引入 `sharp` 依赖用于图片 resize 和编码

## Capabilities

### New Capabilities

- `image-cache`: 图片压缩、缓存存储和内容寻址管理
- `image-session`: Session 中图片引用的序列化/反序列化，以及 vision 调用日志

### Modified Capabilities

- `session-management`: Session 序列化格式从 version 1 升级到 version 2，消息结构支持 ImageRef 而非内联 base64
- `vision-pipeline`: Vision 模型调用后记录日志到 session

## Impact

- **新依赖**: `sharp`（native binding 图片处理库）
- **`src/core/types.ts`**: `SessionMetadata` 新增字段；`SerializedSession` version bump；新增 `ImageRef`、`VisionMessage` 类型
- **`src/utils/image-cache.ts`** (新文件): 压缩 + 缓存读写
- **`src/session/manager.ts`**: `saveSession()` 中将内联图片转为引用；`loadSession()` 中按引用恢复图片
- **`src/session/store.ts`**: 兼容读取 version 1 和 version 2 的 session 文件
- **`src/core/harness.ts`**: `promptWithImages()` 中插入缓存步骤；`describeImagesViaVisionModel()` 中记录 vision 日志
- **`src/ui/web/protocol.ts`**: `ServerEvent` 和 `ConversationMessage` 适配 ImageRef
- **Web 前端**: Session 加载时根据 ImageRef 读取缓存渲染图片
