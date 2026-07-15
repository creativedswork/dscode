## Why

拖入 PDF 等大文件到 Web UI 没有任何反应 — 因为 `MAX_FILE_SIZE = 50KB` / `MAX_TOTAL_SIZE = 200KB` 的硬限制太小，超出后静默丢弃。同时文件上传后写入 `.dscode/uploads/` 但从不清理，缓存无限增长且用户无感知。

## What Changes

- **解除文件大小限制**：单文件上限从 50KB 提升到 10MB，总计从 200KB 提升到 50MB，超出时 toast 提示
- **Settings 面板新增 Cache 区块**：显示上传缓存总大小和 Clear 按钮
- **服务器端缓存查询和清理**：新增 `cache_size` 事件和 `clear_cache` 命令
- **Session 删除时自动清理**：删除 session 时同步清理对应的上传缓存目录

## Capabilities

### New Capabilities
- `web-upload-cache`: Settings 面板展示上传缓存大小并提供一键清除功能；服务器端提供查询和清理接口；session 删除时自动清理上传文件

### Modified Capabilities
- `web-drag-drop-files`: 文件大小限制从 50KB/200KB 改为 10MB/50MB，超出时 toast 提示而非静默丢弃

## Impact

- `web/src/components/MessageInput.tsx` — MAX_FILE_SIZE/MAX_TOTAL_SIZE 常量修改，新增 toast 提示
- `web/src/components/Sidebar.tsx` — SettingsPanel 新增 Cache 区块
- `src/ui/shared/types.ts` — ClientCommand 新增 `clear_cache`，ServerEvent 新增 `cache_size`
- `src/ui/web/web-backend.ts` — 新增 cache_size 查询、clear_cache 处理、session 删除时调用 cleanupUploadDir
