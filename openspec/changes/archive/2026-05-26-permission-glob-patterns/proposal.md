## Why

当前权限系统只支持精确工具名匹配（或全局 `*`），无法用一条规则覆盖整个 MCP server 的工具（如 `mcp__lsp__*`）。同时，`Always Allow` 只能记到会话内存，用户无法持久化到 settings.json 跨会话复用。Claude Code 已支持 `allow`/`deny` 数组 + `*` 通配，dscode 应兼容此格式。

## What Changes

- **工具名通配匹配**：`PermissionRule.tool` 支持 `*` glob 模式（`mcp__lsp__*` 匹配该 server 全部工具）
- **Claude Code 权限格式兼容**：settings.json 支持 `allow`/`deny` 字符串数组，与现有 `rules` 对象数组共存
- **持久化权限选项**：TUI 和 Web UI 增加「Always Allow (save)」按钮，将通配规则写入 settings.json
- **三层权限模型**：Allow once（本次调用）→ Always Allow（本会话内存）→ Always Allow save（持久化文件）
- **Modified**: `shared-permission-model` 的 `PermOption.value` 增加 `"always_allow_save"` 选项

## Capabilities

### New Capabilities
- `tool-name-glob`: 工具名 glob 模式匹配，支持 `mcp__<server>__*` 等通配规则
- `claude-code-permission-format`: settings.json 兼容 Claude Code 的 `allow`/`deny` 数组格式
- `permission-persist-ui`: TUI 和 Web UI 的权限弹窗支持「Always Allow (save)」持久化选项

### Modified Capabilities
- `shared-permission-model`: `PermOption.value` 扩展 `"always_allow_save"`，`PermissionPromptResult` 支持 `persistRule` 携带通配模式

## Impact

- `src/permissions/manager.ts` — `evaluate()` 增加 glob 匹配，`persistRule()` 输出 Claude Code 格式
- `src/core/config.ts` — 读取 settings.json 时解析 `allow`/`deny` 数组
- `src/core/types.ts` — `PermissionRuleConfig.tool` 支持通配模式
- `src/ui/conversation.ts` — TUI `PERM_OPTIONS` 增加 save 选项
- `src/ui/tui-app.ts` — 处理 `always_allow_save` 分支
- `src/ui/shared/types.ts` — `PermOption.value` / wire protocol 扩展
- `web/src/components/PermissionDialog.tsx` — Web UI 增加 save 按钮
- `src/ui/web/web-backend.ts` — 处理 `always_allow_save` 消息
