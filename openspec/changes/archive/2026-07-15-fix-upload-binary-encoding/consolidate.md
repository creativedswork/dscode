## 变更综述

文件拖拽上传的字节保真度演进：初始实现用 `readAsText()` 读取所有文件并用 UTF-8 写出，导致 PDF/DOCX 等二进制文件的非 UTF-8 字节被替换为 U+FFFD 而永久损坏。经过多次迭代（拖拽能力、格式协议、大小限制），最终通过 base64 编码管道实现 100% 字节精确还原。

## 变更时间线

- 2026-07-08: web-drag-drop-files — Web UI 支持拖拽文件插入 `@path`，FileAttachment 类型、文件芯片、双向同步
- 2026-07-08: drag-drop-file-attachments — `[file:xxx]` 格式协议 + FileTracker，统一 Web/TUI 文件追踪
- 2026-07-08: fix-at-image-size-limit — 修复 `@` 引用图片时的 50KB 限制
- 2026-07-15: fix-file-upload-cache — 解除文件大小限制（50KB→10MB），新增上传缓存展示与清理
- 2026-07-15: fix-upload-binary-encoding — 修复二进制文件上传编码损坏问题

## 初始设计

**问题**：Web UI 用户只能通过 `@` 自动补全或剪贴板粘贴引用文件，拖拽——最直观的方式——完全无效。

**方案**：Web UI 输入区接受拖拽的 `File` 对象，用 `readAsText()` 读取内容，作为 `uploadedFile` 发送到后端，后端用 `writeFileSync(path, content, "utf-8")` 写入磁盘。

## 变更记录

### 变更: [file:xxx] 格式协议 + FileTracker

- **触发**: 用户拖入文件后无法在编辑器中看到文件与提示词的关联
- **改动**: 引入 `[file:displayPath]` 纯文本标记协议，FileTracker 统一 Web/TUI 文件追踪
- **影响**: Web UI 的 `handleDrop` 改为注册 tracker + 芯片展示；TUI 新增拖拽处理和 attachment bar

### 变更: 图片 @ 引用大小限制修复

- **触发**: `resolveAtFileRefs` 对所有文件统一施加 50KB 限制，>50KB 图片被静默跳过
- **改动**: 移除图片的 `maxFileSize` 门禁，新增 `maxImageSize`（20MB），图片不计入 `maxTotalSize`
- **影响**: `at-file-resolver.ts`、`AtFileConfig` 类型、配置默认值

### 变更: 解除文件大小限制 + 缓存管理

- **触发**: 50KB/200KB 硬限制静默丢弃文件；上传缓存无限增长无感知
- **改动**: 单文件上限 50KB→10MB，总计 200KB→50MB，超出 toast 提示；Settings 面板新增 Cache 区块；session 删除时清理上传目录
- **影响**: `MessageInput.tsx`、`Sidebar.tsx`、`web-backend.ts`、shared types

## 修复记录

### 修复: 二进制文件上传编码损坏

- **症状**: 拖入 PDF/DOCX 等二进制文件后，落盘文件字节与原始文件不一致——所有非 UTF-8 字节被替换为 U+FFFD 替换字符，文件永久损坏。`fix-file-upload-cache` 中标注为已知限制但未解决。
- **根因**: 
  - 前端 `MessageInput.tsx` 使用 `reader.readAsText(file)` 以 UTF-8 解码文件内容，非 UTF-8 字节被替换为 U+FFFD
  - 后端 `web-backend.ts` 用 `writeFileSync(path, content, "utf-8")` 写出，再次编码转换
  - 两次编解码导致原始字节永久丢失
- **修复**: 
  - 前端改用 `readAsArrayBuffer()` 读取原始字节 → 转 base64 字符串 → 通过 WebSocket 发送
  - 后端改用 `Buffer.from(content, "base64")` 解码还原原始字节 → 直接写入磁盘
  - 文本文件同样走 base64 管道（不再按 MIME type 分流），简化逻辑且保证字节精确
  - 类型定义 `content: string` 保持不变（base64 编码后仍是 string）

## 最终状态

**问题**：Web UI 拖拽上传非图片文件时，前端用 `readAsText()` 以 UTF-8 解码，导致非 UTF-8 字节被永久替换为 U+FFFD；后端再以 UTF-8 写出，最终落盘文件已损坏不可用。

**方案**：
- 前端改用 base64 传输：`MessageInput` 对非图片文件统一用 `readAsArrayBuffer()` 读取，转 base64 后通过 WebSocket 发送
- 后端改用 base64 解码写入：`web-backend.ts` 用 `Buffer.from(content, "base64")` 写出原始字节
- 文本文件同样走 base64：不再按 MIME type 分流，统一 base64 简化逻辑且保证字节精确还原
- 类型定义中 `content: string` 保持不变（base64 编码后仍是 string）

**新增能力**：
- `binary-upload-encoding`: 非图片文件拖拽上传时，前端以 base64 编码传输原始字节，后端解码还原写入磁盘

**修改能力**：
- `web-drag-drop-files`: "Non-image file within size limit" scenario 中 "read as text" 改为 "read as base64"
