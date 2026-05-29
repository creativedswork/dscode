## Why

Vision model 配置当前在 Web UI Settings 面板中始终可见（即便未配置也只显示 `(not set)` 占位），且没有删除已配置 vision 的入口。这造成两个问题：未配置时占据不必要的 UI 空间、增加认知负担；已配置后无法一键清除，只能手动逐字段清空。

## What Changes

- Web UI Settings 面板：vision 未配置时不显示配置表单项，改为底部显示 `[+ Add Vision Model]` 按钮
- 点击 Add 按钮后展开完整的 vision 配置 UI（provider / model / key）
- 已配置时显示完整配置 UI，并在底部增加 `[Delete]` 按钮
- 新增 wire protocol 命令 `set_vision_delete`：一键清除 vision 全部配置
- 后端 `saveUserConfig` 支持通过 `null` 值删除 key

## Capabilities

### New Capabilities

- `vision-config-add-delete-ui`: Vision 模型配置的添加/删除交互流程，包括前端的条件渲染、新增的 `set_vision_delete` 协议命令、以及持久层的 key 删除支持

### Modified Capabilities

- `web-frontend`: SettingsPanel 组件布局变更 — vision 区块从始终可见改为条件渲染
- `websocket-protocol`: ClientCommand 新增 `set_vision_delete` action
- `web-server`: Config handler 新增 `set_vision_delete` case

## Impact

- `web/src/types/index.ts` — 重新导出，无直接改动
- `src/ui/shared/types.ts` — ClientCommand 新增 `set_vision_delete`
- `web/src/components/Sidebar.tsx` — SettingsPanel 条件渲染 + Add/Delete 按钮
- `src/ui/web/web-backend.ts` — 新增 `set_vision_delete` handler
- `src/core/config.ts` — `saveUserConfig` 支持 null 值删除 key
- TUI `/config` 命令可选跟进（`/config vision-delete`）
