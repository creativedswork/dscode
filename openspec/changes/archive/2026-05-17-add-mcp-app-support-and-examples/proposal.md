## Why

MCP Apps (SEP-1865) 是 MCP 协议的标准扩展，允许 MCP Server 提供交互式 UI（图表、表单、dashboard），在 sandboxed iframe 中渲染。目前 dscode 作为 TUI CLI Agent 对 MCP Apps 零支持——连接带 UI metadata 的 MCP Server 时完全透明降级为纯文本，用户无法使用任何交互式功能。需要提供基本兼容能力和一个可验证的端到端示例。

## What Changes

- **声明 MCP Apps capability negotiation**：`MCPClient` 在 initialize 时声明 `io.modelcontextprotocol/ui` 支持，使 Server 能返回带 `_meta.ui` 的 tool
- **过滤 app-only tools**：`ToolRegistry` 识别 `visibility: ["app"]` 的 tool，不暴露给 LLM，避免 context 污染
- **检测并标记 UI-enabled tools**：`MCPManager` 检测 tool 的 `_meta.ui.resourceUri`，标记有 UI 的工具
- **本地 sandbox HTTP Server + bridge**：`AppHostManager` 提供本地 HTTP Server 托管 sandbox proxy HTML，支持 View ↔ Host 的 JSON-RPC over HTTP bridge
- **TUI 通知集成**：tool 执行结果后追加 MCP App URL 通知，用户可在浏览器查看
- **示例项目**：`examples/scenario-modeler/` 提供完整的 MCP App (Scenario Modeler)，展示单 HTML 文件 View + 标准 MCP SDK Server

## Capabilities

### New Capabilities
- `mcp-app-negotiation`: MCP Apps capability negotiation — client 声明 ui 扩展，server 注册带 _meta.ui 的 tool
- `mcp-app-tool-filtering`: 按 visibility 过滤 app-only tools，阻止它们进入 LLM context
- `mcp-app-sandbox-host`: 本地 HTTP Server + sandbox proxy HTML + JSON-RPC bridge
- `mcp-app-tui-notification`: TUI 显示 MCP App URL，引导用户在浏览器查看交互式 UI

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Affected code**: `src/mcp/client.ts`, `src/mcp/manager.ts`, `src/mcp/types.ts`, `src/drivers/tool-registry.ts`, `src/core/harness.ts`, `src/core/types.ts`, `src/ui/tui-app.ts`, `src/ui/conversation.ts`
- **New files**: `src/apps/host.ts`, `src/apps/bridge.ts`, `src/apps/sandbox.html`, `src/apps/types.ts`, `src/mcp/app-types.ts`
- **New directory**: `examples/scenario-modeler/` (5 source files)
- **Dependencies**: `@modelcontextprotocol/sdk` (existing), `express` + `cors` (example only, dev dependency), 无新增 runtime dependency for dscode core
- **No breaking changes**: 所有 MCP Apps 功能为 opt-in，不影响现有功能
