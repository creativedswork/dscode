## 变更综述

文件拖拽功能的最终形态演进：从 Web UI 基础拖拽 → `[file:xxx]` 格式协议 → 大小限制 + 缓存 → 二进制编码修复 → 到最后一次全面重构：TUI 非图片文件改为路径引用（不预读内容）、Web UI 图片浏览器端压缩、项目文件自动 @path 匹配、config 驱动的文件大小限制、Settings 上传缓存管理。这个变更修正了拖拽功能中所有的设计缺陷，建立了完整的 Web/TUI 双端一致的文件处理架构。

## 变更时间线

- 2026-07-08: web-drag-drop-files — Web UI 支持拖拽文件插入 @path，FileAttachment 类型、文件芯片、双向同步
- 2026-07-08: drag-drop-file-attachments — [file:xxx] 格式协议 + FileTracker，统一 Web/TUI 文件追踪
- 2026-07-08: fix-at-image-size-limit — 修复 @ 引用图片时的 50KB 限制
- 2026-07-15: fix-file-upload-cache — 解除文件大小限制（50KB→10MB），新增上传缓存展示与清理
- 2026-07-15: fix-upload-binary-encoding — 修复二进制文件上传编码损坏（readAsText → base64）
- 2026-07-15: fix-tui-file-drag-drop — TUI 路径引用、Web 图片压缩、@path 匹配、config 驱动限制

## 初始设计

**问题**：Web UI 用户无法拖拽文件——最直观的交互方式完全缺失。

**方案**：Web UI 接受拖拽，readAsText() 读内容 → 上传到 .dscode/uploads/ → 注入 prompt。引入 FileAttachment、文件芯片、双向同步。

## 变更记录

### 变更: [file:xxx] 格式协议 + FileTracker

- **触发**: 用户拖入文件后无法在编辑器中看到文件与提示词的关联
- **改动**: 引入 [file:displayPath] 纯文本标记协议，FileTracker 统一 Web/TUI 文件追踪
- **影响**: Web UI handleDrop 改为注册 tracker + 芯片；TUI 新增拖拽处理和 attachment bar

### 变更: 图片 @ 引用大小限制修复

- **触发**: resolveAtFileRefs 对所有文件统一施加 50KB 限制，>50KB 图片被静默跳过
- **改动**: 移除图片的 maxFileSize，新增 maxImageSize（20MB），图片不计入 maxTotalSize

### 变更: 解除文件大小限制 + 缓存管理

- **触发**: 50KB/200KB 硬限制静默丢弃；上传缓存无限增长
- **改动**: 单文件 50KB→10MB，总计 200KB→50MB，超出 toast；Settings Cache 区块；session 删除清理

### 变更: 二进制文件上传编码修复

- **触发**: readAsText() 导致 PDF/DOCX 等二进制文件 UTF-8 解码损坏
- **改动**: 前端 readAsArrayBuffer() → base64，后端 Buffer.from(content, "base64") 解码

## 修复记录

### 修复: TUI 文件拖拽路径引用 + Web 全面重构

- **症状**: 
  - TUI 拖放非图片文件时 resolveFileRefs 预读全文注入 prompt，浪费 context window
  - Web UI 大图片（>500KB）传输中被截断，vision 降级 OCR 产生乱码
  - Web UI 文件大小限制硬编码 50KB，超限静默跳过无提示
  - 项目文件被完整上传到 temp 目录而非 @path 引用
- **根因**: 
  - TUI 端 resolveFileRefs 对图片和非图片文件一视同仁，全部读取内容
  - Web UI 图片未经浏览器端压缩，原始 base64 过大导致 WebSocket 传输截断
  - MessageInput 中 MAX_FILE_SIZE 硬编码而非 config 驱动
  - 缺少项目文件匹配逻辑，所有文件都走上传路径
- **修复**: 
  - TUI 非图片文件：注入绝对路径引用 `📁 Attached files:\n- \`/abs/path/file\``，不调 resolveFileRefs
  - TUI 图片文件：保持现有 ImagePipeline 行为
  - Web UI 图片上传：Canvas resize max 480px → JPEG 85% 浏览器端压缩
  - Web UI 拖放项目文件：搜索项目目录，自动匹配为 @path 引用，零传输
  - Web UI 文件大小限制：从硬编码改为 config 驱动（默认 10MB/50MB），超限 toast
  - Settings 面板：上传缓存统计 + 一键清空按钮
  - web-backend.ts：修复重复 fileRefs split block（导致路径注入两次）

## 最终状态

**问题**：TUI 非图片拖放浪费 context window，Web 图片传输截断，文件大小限制僵化，项目文件被重复上传。

**方案**：
- TUI 非图片 → 路径引用，不预读内容，Agent 按需 read_file
- TUI 图片 → 保持 ImagePipeline（不变）
- Web 图片 → 浏览器端 Canvas 压缩（max 480px JPEG 85%）再传输
- Web 项目文件 → 自动 @path 匹配，零传输
- Web 外部文件 → 上传到 .dscode/uploads/，base64 编码
- 文件大小限制 → config 驱动，默认 10MB/50MB
- Settings → 上传缓存统计 + 清空

**新增能力**：
- `tui-file-drop-path-ref`: TUI 非图片文件注入路径引用而非内容
- `web-upload-temp-file`: Web 文件上传、@path 匹配、config 限制、toast 反馈
- `web-image-compress`: Web 图片浏览器端压缩

**修改能力**：
- `file-tracker`: resolveFileRefs 按文件类型分流（图片走管线，非图片走路径注入）
