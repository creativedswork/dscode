## Context

当前 Web UI 的 `MessageInput` 组件通过拖拽接受非图片文件时，读取文件内容并通过 WebSocket 发送到后端。后端将内容写入 `<project>/.dscode/uploads/<sessionId>/` 目录。但存在两个问题：

1. **文件大小限制过严**：`MAX_FILE_SIZE = 50KB`，多数文档类文件（PDF、DOCX 等）远超此阈值，被静默丢弃
2. **缓存无管理**：上传文件永不清除（`cleanupUploadDir` 已定义但从无调用），也无 UI 展示缓存状态

## Goals / Non-Goals

**Goals:**
- 单文件上限 10MB、总计 50MB，超出时 toast 提示
- Settings 面板显示上传缓存总大小和 Clear 按钮
- Session 删除时清理对应上传文件
- 40MB 以上缓存时 UI 警告提示

**Non-Goals:**
- 不改变文件上传的存储路径（仍为 `.dscode/uploads/<sessionId>/`）
- 不增加按 session 粒度的单独清理
- 不做上传进度条

## Decisions

### 1. 缓存查询和清除通过 WebSocket 消息实现

**方案**: 新增 `ClientCommand: { type: "cache", action: "size" | "clear" }` 和 `ServerEvent: { type: "cache_size", totalBytes: number, fileCount: number, sessionCount: number }`

**替代方案考虑**:
- HTTP REST 端点：需引入额外路由，与现有纯 WebSocket 通信模式不一致 → 拒绝
- 用现有 `config` 命令扩展：语义不匹配 → 拒绝

### 2. 缓存大小在 Settings 面板打开时自动查询

每次切换到 Settings tab 时前端发送 `cache_size` 请求。不轮询、不推送变化（缓存只在用户主动操作时变化）。

### 3. Clear 操作清除所有 session 的上传目录

遍历 `.dscode/uploads/` 下所有子目录逐一删除，而非仅当前 session。用户视角下这是一个全局临时缓存。

### 4. 文件大小严重超限时 toast 提示

当单文件超过 10MB 或累计超过 50MB 时，不再 `continue` 静默跳过，而是调用 `addToast` 显示提示（如 "File 'report.pdf' exceeds 10 MB limit"）。

### 5. 40MB 阈值触发 warning 样式

`cacheBlock` 添加 `danger` class（红色边框 + 提示文案 "Consider clearing to free disk space"）。

## Risks / Trade-offs

- [Risk] Clear 操作删除其他 session 正在使用的上传文件 → Mitigation: 上传文件是临时副本，实际文件在用户本地。Clear 只影响"已发送但被模型引用的文件路径"，不会导致数据丢失
- [Risk] 10MB 单文件限制可能导致大 PDF 仍被拒绝 → Mitigation: 文件内容通过 `readAsText` 读取为文本后发送，对于二进制文件可能无效。这是已知限制，不在本次 scope 内解决
