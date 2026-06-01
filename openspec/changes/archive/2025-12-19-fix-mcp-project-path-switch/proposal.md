## Why

当用户通过 `/config cwd` 切换项目路径后，MCP 服务器虽然重新连接成功（UI 显示 connected），但实际调用 MCP 工具时会失败（报 "client closed"）。根因是 `ToolRegistry` 在切换项目路径后未重新初始化，仍持有旧的 `AgentTool` 对象（闭包中捕获了已关闭的旧 `MCPClient`）。同时，切换项目路径时 MCP 配置只加载了项目级 settings，丢掉了用户级 MCP 配置，与 `loadConfig()` 的合并行为不一致。

## What Changes

- **修复 ToolRegistry 未重新初始化**：`updateProjectPath()` 在创建新 MCP manager 并注册 drivers 后，重新调用 `toolRegistry.initialize()` 以拾取新的 AgentTool 对象
- **ToolRegistry 支持重入**：`ToolRegistry.initialize()` 支持多次调用，重入时清空旧的 MCP 工具条目和 deferred 状态
- **MCP 配置合并用户级 settings**：`updateProjectPath()` 加载 MCP 配置时，像 `loadConfig()` 一样合并用户级 settings（`~/.dscode/settings.json`），避免丢失用户全局 MCP 服务器

## Capabilities

### New Capabilities

- `tool-registry-reinit`: `ToolRegistry.initialize()` 支持重复调用，重入时清除旧 MCP 状态并重新构建工具索引

### Modified Capabilities

- `core-harness`: `updateProjectPath()` 的 MCP 重载流程补充 `toolRegistry.initialize()` 调用，并合并用户级 MCP 配置

## Impact

- `src/drivers/tool-registry.ts` — `initialize()` 方法增加重入清理逻辑
- `src/core/harness.ts` — `updateProjectPath()` 增加 `toolRegistry.initialize()` 调用和用户 settings 合并
