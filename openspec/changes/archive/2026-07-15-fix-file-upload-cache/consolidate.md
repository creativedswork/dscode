## 变更综述

文件拖拽上传功能从零到完整的演进历程：从 Web UI 支持拖拽插入 `@path`，到引入 `[file:xxx]` 格式协议和 FileTracker 统一 Web/TUI 两端的文件追踪，再到解除上传大小限制并增加缓存可见性与清理能力。最终状态是一个用户可以拖入文件、看到清晰的缓存状态、并能一键清理的完整闭环。

## 变更时间线

- 2026-07-08: web-drag-drop-files — Web UI 支持拖拽文件插入 `@path`，FileAttachment 类型、文件芯片、双向同步
- 2026-07-08: drag-drop-file-attachments — `[file:xxx]` 格式协议 + FileTracker，统一 Web UI 和 TUI 的文件追踪
- 2026-07-08: fix-at-image-size-limit — 修复 `@` 引用图片时的 50KB 限制（图片走 vision pipeline，不应受限）
- 2026-07-15: fix-file-upload-cache — 解除文件上传大小限制，新增上传缓存展示与清理

## 初始设计

**问题**：Web UI 用户只能通过 `@` 自动补全或剪贴板粘贴引用文件，拖拽——最直观的方式——完全无效。帮助文本甚至声称支持拖拽，这是误导。

**方案**：
- Web UI 输入区接受拖拽的 `File` 对象，读取元数据（名称、大小、MIME、绝对路径），作为 `FileAttachment` 存入状态
- 在文本区上方渲染文件芯片（图标 + 文件名 + 大小 + 删除按钮）
- 将显示路径（项目内文件用相对路径，外部文件用绝对路径）作为 `@path` 插入文本区
- 芯片与文本双向同步：删除芯片移除 `@path`，删除 `@path` 移除芯片

## 变更记录

### 变更: [file:xxx] 格式协议 + FileTracker

- **触发**: 用户拖入文件后无法在编辑器中看到文件与提示词的关联（"review this" 和上面 attach 的三个文件没有可见连接）
- **改动**: 引入 `[file:displayPath]` 纯文本标记协议（类似 `[image:N]`），在编辑器中可见、可输入、可删除。FileTracker 作为每消息的文件路径注册表，从编辑器的 `onChange` 事件中解析 `[file:xxx]` 标记来双向同步。TUI 拖拽插入 `[file:xxx]`，Web UI 保持芯片模式。提交时 `[file:xxx]` 保留在文本中传递给模型，同时 `fileRefs` 数组传递给后端解析器。
- **影响**: Web UI 的 `handleDrop` 从插入 `@path` 改为注册 tracker + 芯片展示；TUI 新增拖拽处理和 attachment bar；`resolveFileRefs()` 新增函数处理显式路径数组

### 变更: 图片 @ 引用大小限制修复

- **触发**: `resolveAtFileRefs` 对所有文件统一施加 50KB 限制，导致 >50KB 的图片被静默跳过，模型收到原始 `@file.jpg` 文本后只能调用 `read_file`
- **改动**: 移除图片的 `maxFileSize` 门禁，新增 `maxImageSize`（20MB）防止极端大图加载。图片不计入 `maxTotalSize`（它们走 vision pipeline 而非文本 token）
- **影响**: `at-file-resolver.ts`、`AtFileConfig` 类型、配置默认值

## 修复记录

### 修复: 解除文件上传大小限制 + 缓存管理

- **症状**: 拖入 PDF 等大文件到 Web UI 无任何反应——`MAX_FILE_SIZE = 50KB` / `MAX_TOTAL_SIZE = 200KB` 的硬限制太小，超出后静默丢弃。同时上传文件写入 `.dscode/uploads/` 后从不清理，缓存无限增长且用户无感知。
- **根因**: 
  - 前端 `MessageInput.tsx` 中常量 `MAX_FILE_SIZE = 50 * 1024`、`MAX_TOTAL_SIZE = 200 * 1024` 过于保守
  - 缺少上传缓存大小查询和清理的后端接口
  - Session 删除时未清理对应的上传目录
- **修复**: 
  - 单文件上限从 50KB → 10MB，总计从 200KB → 50MB，超出时 toast 提示而非静默丢弃
  - Settings 面板新增 Cache 区块：显示总大小、文件数、session 数，超标时红色警告，一键 Clear
  - 服务器端新增 `cache_size` 事件（查询）和 `clear_cache` 命令（清理）
  - Session 删除时调用 `cleanupUploadDir(sessionId)` 清理对应上传目录

## 最终状态

**问题**：拖入 PDF 等大文件到 Web UI 没有任何反应——因为 `MAX_FILE_SIZE = 50KB` / `MAX_TOTAL_SIZE = 200KB` 的硬限制太小，超出后静默丢弃。同时文件上传后写入 `.dscode/uploads/` 但从不清理，缓存无限增长且用户无感知。

**方案**：
- **解除文件大小限制**：单文件上限从 50KB 提升到 10MB，总计从 200KB 提升到 50MB，超出时 toast 提示
- **Settings 面板新增 Cache 区块**：显示上传缓存总大小和 Clear 按钮
- **服务器端缓存查询和清理**：新增 `cache_size` 事件和 `clear_cache` 命令
- **Session 删除时自动清理**：删除 session 时同步清理对应的上传缓存目录

**新增能力**：
- `web-upload-cache`: Settings 面板展示上传缓存大小并提供一键清除功能；服务器端提供查询和清理接口；session 删除时自动清理上传文件

**修改能力**：
- `web-drag-drop-files`: 文件大小限制从 50KB/200KB 改为 10MB/50MB，超出时 toast 提示而非静默丢弃
