## Context

当前 `fix-file-upload-cache` 变更已将非图片文件上传的 size limit 从 50KB 提升到 10MB。但前端 `MessageInput.handleDrop` 对非图片文件使用 `FileReader.readAsText(file)` 读取内容，以 UTF-8 解码后通过 WebSocket 发送；后端 `web-backend.ts` 以 `writeFileSync(path, content, "utf-8")` 写出。PDF、DOCX 等二进制文件经过「UTF-8 解码 → 字符串 → UTF-8 编码」往返后原始字节永久丢失，落盘文件损坏不可用。`fix-file-upload-cache` design.md 将此事标注为已知限制但不在 scope。

## Goals / Non-Goals

**Goals:**
- 非图片文件上传后落盘内容与原始文件 100% 字节一致
- 图片文件路径不变（仍走 `readAsDataURL` + compress）
- 文本文件同样走 base64，不做 MIME type 分流（避免维护两套路径）

**Non-Goals:**
- 不改变文件上传的存储路径（仍为 `.dscode/uploads/<sessionId>/`）
- 不做上传进度条
- 不做增量/流式上传
- 不引入新的 WebSocket 消息类型（复用现有 `uploadedFiles[].content` 字段）

## Decisions

### 1. 统一用 base64 编码传输

**方案**: 前端 `readAsArrayBuffer()` → `Buffer.from(arrayBuffer)` → `.toString("base64")`，后端 `Buffer.from(content, "base64")` → `writeFileSync(path, buffer)`。

**替代方案考虑**:
- **按 MIME type 分流**（text/* → readAsText, 其他 → base64）：需要维护两种读取和写入路径，逻辑分支增多，且 text/* 的范围模糊（如 `application/json`、`application/xml` 本质是文本但 MIME 不是 `text/*`），增加维护成本和潜在 bugs → 拒绝
- **WebSocket binary frames**：需要改动 WebSocket 协议层，复杂度过高，且已有 JSON 文本帧的基建 → 拒绝
- **HTTP multipart upload**：需引入额外路由和 HTTP 客户端逻辑，与纯 WebSocket 通信模式不一致 → 拒绝

### 2. `content: string` 类型不变

`uploadedFiles[].content` 在 `types.ts` 中已经是 `string`。base64 编码天然是 string，类型无需变更。唯一变化是语义：从「UTF-8 文本内容」变为「base64 编码的原始字节」。

### 3. 后端 `writeFileSync` 去掉 encoding 参数

原来 `writeFileSync(tempPath, uf.content, "utf-8")` 将字符串编码为 UTF-8 字节后写入。改为 `writeFileSync(tempPath, Buffer.from(uf.content, "base64"))`：先将 base64 字符串解码为原始 `Buffer`，再写入磁盘。`writeFileSync` 接收 `Buffer` 时不再做任何编码转换。

## Risks / Trade-offs

- [Risk] Base64 编码增加 33% 传输体积 — 对于 10MB 文件，WebSocket 消息约 13.3MB 的 JSON 字符串。Mitigation: 10MB 单文件限制已经控制了上限；对于 LAN/localhost WebSocket，延迟影响可忽略。
- [Risk] 文本文件原本 `readAsText` 路径工作正常，改为 base64 后体积增加 — Mitigation: 10MB 限制下，对于几十 KB 的文本文件，base64 开销微不足道（33KB → 44KB）。统一路径消除分歧逻辑的价值远大于这点开销。
- [Risk] 与已发送但未 consummate 的缓存文件不兼容 — Mitigation: 所有缓存文件是临时副本，用户本地有原始文件。且 fix-file-upload-cache 提供了 Clear Cache 功能。
