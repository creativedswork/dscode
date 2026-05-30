## Context

当前 MCP 生命周期在 `harness.run()` 中的顺序是：`ui.start()` → MCP 初始化。在 TUI 模式下这不是问题，因为 MCP 面板是 lazy pull 的（用户打开时才读 `mcpManager.getStates()`）。但 Web UI 是 push-once 模式：客户端连接后立即拉取 `mcp "list"`，此时 MCP 尚未初始化，且初始化完成后没有状态推送。

此外，`MCPManager` 只有批量 `initialize()` / `shutdown()` 方法，不支撑单个 server 的连接/断开。Web UI 侧边栏只有全局 Refresh，没有 per-server 操作按钮。

## Goals / Non-Goals

**Goals:**
- MCP 初始化完成后自动推送 `mcp_state` 到所有已连接的 WebSocket 客户端
- 新 WS 客户端连接时，如果 MCP 已就绪，推送当前 `mcp_state`
- 支持 per-server connect/disconnect，状态变更后即时推送
- Web UI 侧边栏每个 server 行显示 Connect/Disconnect 按钮

**Non-Goals:**
- 不在 TUI 中增加 per-server connect/disconnect UI（TUI 已有自己的 MCP 面板交互）
- 不改变 MCP 配置的加载方式（settings.json → config 的流程不变）
- 不处理 MCP server 配置热更新（修改 settings.json 后自动重连）

## Decisions

### 1. 状态推送机制：在 `WebUiBackend` 上新增 `pushMcpState()` 方法

**选择**：在 `UiBackend` 接口新增可选方法 `pushMcpState?()`，由 `WebUiBackend` 实现为 `broadcast({ type: "mcp_state", servers })`。`TuiBackend` 留空。

**替代方案**：在 `Harness` 中判断 backend 类型 — 违反抽象。

**理由**：保持 `UiBackend` 抽象干净，方法语义明确（"推送当前 MCP 状态"），Web-only 行为通过 optional method 实现。

### 2. Per-server connect/disconnect：扩展 `MCPManager`

**选择**：在 `MCPManager` 上新增：
```typescript
async connectServer(name: string): Promise<void>
async disconnectServer(name: string): Promise<void>
```

- `connectServer`: 创建新的 `MCPClient`，调用 `connect()`，`listTools()`，注册 driver，更新 state
- `disconnectServer`: 调用 `client.close()`，从 `clients` map 移除，unregister driver，更新 state

**替代方案**：在 `MCPManager` 上暴露 `reconnectServer(name)` 统一处理 — 但 connect/disconnect 是两个独立操作，分开更清晰。

**理由**：复用现有 `MCPClient` 的 `connect()` / `close()` 方法。driver 的 register/unregister 通过 `DriverRegistry` 已有接口完成。

### 3. Driver 注销：利用 `ToolRegistry` 重新 build tools

**选择**：disconnect 时调用 `driverRegistry.unregister("mcp_<name>")`，然后让 harness 的 `transformContext` 自然触发 `toolRegistry.buildToolsForRequest()`。

**替代方案**：disconnect 后立即重建 tools — 更重但更即时。

**理由**：现有 `DriverRegistry` 已有 `unregister` 方法（待确认），`transformContext` 在下一次 LLM 调用时会重建工具列表。对于 UI 操作，不需要立即重建。

### 4. WebSocket 协议扩展：mcp 命令增加 action

**选择**：扩展现有 `{ type: "mcp", action: "..." }` 命令：
```typescript
| { type: "mcp"; action: "list" | "refresh" | "connect" | "disconnect"; serverName?: string }
```

`connect` 和 `disconnect` 需要 `serverName`，`list` 和 `refresh` 保持不变。

**理由**：最小化协议变更，复用现有 `mcp` 命令类型，只需扩展 `action` 联合类型。

### 5. UI 按钮布局

**选择**：在 McpPanel 中每个 server 行右侧，根据状态显示按钮：
- `disconnected` / `error`：显示 `Connect` 按钮
- `connected` / `connecting`：显示 `Disconnect` 按钮

按钮使用 small secondary style，放在 status badge 旁边。

## Risks / Trade-offs

- **[Risk] disconnect 后 agent 仍可能尝试调用已断开的 MCP tool** → 调用时会报错，错误信息会展示给用户，不会静默失败。
- **[Risk] `DriverRegistry.unregister` 可能不存在** → 检查确认，若不存在则新增该方法。`DriverRegistry` 已有 `register`，对称添加 `unregister` 是合理的。
- **[Risk] 多个 WS 客户端同时操作 connect/disconnect** → `MCPManager` 的方法本身是幂等的（重复 connect 检查已连接，重复 disconnect 检查已断开），不会产生竞态问题。
