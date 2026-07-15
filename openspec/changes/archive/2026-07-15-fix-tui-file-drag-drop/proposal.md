## Why

TUI 拖放非图片文件时，`resolveFileRefs` 会读取文件全文并注入到 prompt 中，造成 context window 大量浪费。Agent 真正需要的是文件的**绝对路径引用**，而非预读的文件内容——Agent 可以自行调用 `read_file` 按需读取。此前 session 00MRL886 的修复尝试停止读取内容，但引入了新 bug：Agent 连绝对路径也感知不到了。

测试中还发现：大图片（>500KB）在 Web UI 传输过程中被截断，导致 vision model 调用失败、静默降级到 OCR。根因是浏览器端未压缩，原始分辨率 base64 过大（871KB 文件 → ~1.16MB base64），在 WebSocket 或终端协议传输中丢失数据。
Web UI 拖入非图片 PDF 等文件时无反应。根因是硬编码 50KB 限制对所有非图片文件生效（图片无限制），且超限文件被静默跳过无提示。此外，外部文件被复制到 temp 目录后缺乏手动清理入口。

## What Changes

- **非图片拖放文件**：不再调用 `resolveFileRefs` 读取内容，改为在 prompt 中注入清晰的绝对路径引用行
- **图片拖放文件**：保持现有行为，通过 `resolveFileRefs` 提取 base64 后进入 ImagePipeline（不变）
- **TUI prompt 框**：保持显示 `[file:basename]` 简洁标记（不变）
- **Web UI 图片上传**：浏览器端先压缩（Canvas resize max 480px → JPEG 85%），再发送（新增）
- **Web UI 拖放项目文件**：自动匹配为 `@path` 引用，零传输零磁盘（新增）
- **Web UI 文件大小限制**：从硬编码 50KB 改为 config 驱动（默认 10MB），超限 toast 提示（修复）
- **Settings 缓存管理**：面板显示上传缓存统计，提供一键清空按钮（新增）
- **Web UI 图片上传**：浏览器端先压缩（Canvas resize max 480px → JPEG 85%），再发送（新增）

## Capabilities

- `web-upload-temp-file`: Web 拖放非图片文件上传到临时目录（扩展：增加 @path 匹配、config 驱动限制、toast 反馈）
- `tui-file-drop-path-ref`: TUI 拖放非图片文件时，Agent prompt 中注入绝对路径引用而非文件内容
- `web-drop-project-match`: Web 拖入项目文件时自动匹配为 @path 引用
- `web-settings-cache`: Settings 面板显示并管理上传缓存
- `web-image-compress`: Web UI 所有图片（paste + drag-drop）在浏览器端压缩后再传输，防止大图截断导致 vision 降级 OCR

### Modified Capabilities
- `file-tracker`: `resolveFileRefs` 的调用方式变更——由 `handleSubmit` 按文件类型分流，图片走 `resolveFileRefs`，非图片走纯路径注入

## Impact

- `web/src/components/MessageInput.tsx` — `handleDrop` 增加项目文件匹配路由、config 驱动大小检查、toast 反馈
- `web/src/components/Sidebar.tsx` — `SettingsPanel` 增加上传缓存区域
- `web/src/components/App.tsx` — 处理 `upload_stats` / `clear_uploads` 事件
- `src/ui/shared/types.ts` — 新增 `upload_stats` / `clear_uploads` 协议类型
- `src/ui/web/web-backend.ts` — 对应 Web 端的 `hasFiles` 分支同样需要修改
- `src/utils/at-file-resolver.ts` — 无需修改（`resolveFileRefs` 保留给图片文件使用）
- `web/src/components/MessageInput.tsx` — `fileToImageAttachment` 增加 Canvas 压缩步骤
