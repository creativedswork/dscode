## Why

Web UI 拖拽上传非图片文件（PDF、DOCX 等二进制文件）时，前端用 `readAsText()` 以 UTF-8 解码文件内容，导致非 UTF-8 字节被替换为 U+FFFD 从而永久丢失原始数据；后端再以 UTF-8 写出，最终落盘文件已损坏不可用。`fix-file-upload-cache` 将其标注为已知限制但未解决，现在是时候修复了。

## What Changes

- **前端改用 base64 传输**：`MessageInput` 对非图片文件统一用 `readAsArrayBuffer()` 读取，转 base64 后通过 WebSocket 发送
- **后端改用 base64 解码写入**：`web-backend.ts` 收到 `uploadedFiles[*].content` 后，用 `Buffer.from(content, "base64")` 写出原始字节
- **文本文件同样走 base64**：不再按 MIME type 分流（text/* → readAsText, 其他 → base64），统一 base64 简化逻辑且保证字节精确还原
- 类型定义中 `content: string` 保持不变（base64 编码后仍是 string）

## Capabilities

### New Capabilities
- `binary-upload-encoding`: 非图片文件拖拽上传时，前端以 base64 编码传输原始字节，后端解码还原写入磁盘，确保 PDF/DOCX 等二进制文件 100% 字节精确

### Modified Capabilities
- `web-drag-drop-files`: "Non-image file within size limit" scenario 中 "read as text" 改为 "read as base64"

## Impact

- `web/src/components/MessageInput.tsx` — 第 485-490 行，`readAsText()` → `readAsArrayBuffer()` + base64 编码
- `src/ui/web/web-backend.ts` — 第 528 行，`writeFileSync(path, content, "utf-8")` → `writeFileSync(path, Buffer.from(content, "base64"))`
- `src/ui/shared/types.ts` — 无需改动（`content: string` 语义不变）
- `openspec/specs/web-drag-drop-files/spec.md` — delta: 修改 "Non-image file within size limit" scenario
