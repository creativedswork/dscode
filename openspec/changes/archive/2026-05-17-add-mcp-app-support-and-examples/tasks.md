## 1. MCP Apps 类型定义与 Capability Negotiation

- [x] 1.1 创建 `src/mcp/app-types.ts` — 定义 McpUiToolMeta, McpUiResourceCsp, UIResourceMeta 等类型
- [x] 1.2 扩展 `src/mcp/types.ts` 中 `MCPToolDefinition` 增加 `_meta` 字段
- [x] 1.3 修改 `src/mcp/client.ts` — `connect()` 时声明 `io.modelcontextprotocol/ui` capabilities；新增 `readResource()` 方法
- [x] 1.4 修改 `src/mcp/client.ts` — `listTools()` 缓存 tool definitions 以便后续查询 `_meta`

## 2. App-only Tool 过滤

- [x] 2.1 修改 `src/mcp/manager.ts` — 新增 `getAppOnlyToolNames()` 方法，遍历 tool definitions 收集 `visibility: ["app"]` 的工具
- [x] 2.2 修改 `src/drivers/tool-registry.ts` — `initialize()` 增加 `appOnlyNames` 参数，将 app-only 工具从 allTools 中排除
- [x] 2.3 修改 `src/mcp/manager.ts` — `registerDrivers()` 时标记 UI-enabled tools，存储 resourceUri 映射

## 3. 本地 Sandbox HTTP Server

- [x] 3.1 创建 `src/apps/types.ts` — AppInstance, BridgeMessage 等内部类型
- [x] 3.2 创建 `src/apps/sandbox.html` — sandbox proxy 页面（CSS + postMessage bridge + inner iframe srcdoc）
- [x] 3.3 创建 `src/apps/host.ts` — AppHostManager 类：HTTP server 启动/关闭、app 注册/注销、/app/:id 路由
- [x] 3.4 创建 `src/apps/bridge.ts` — Bridge 路由处理：POST /api/bridge/:id (工具调用代理)、GET /api/bridge/:id/events (SSE)
- [x] 3.5 `src/apps/host.ts` 中实现 CSP header 构建逻辑 (buildContentSecurityPolicy)

## 4. Harness 集成

- [x] 4.1 修改 `src/core/types.ts` — HarnessConfig 增加 `appHost: { enabled: boolean }` 配置
- [x] 4.2 修改 `src/core/harness.ts` — `initialize()` 中创建 AppHostManager 实例
- [x] 4.3 修改 `src/core/harness.ts` — `run()` 中 MCPManager 连接后关联 AppHostManager
- [x] 4.4 修改 `src/core/harness.ts` — `afterToolCall` 回调中检测 UI metadata，获取 HTML 并注册 app

## 5. TUI 通知

- [x] 5.1 修改 `src/ui/tui-app.ts` — 新增 `addAppNotification(app: AppInstance)` 方法
- [x] 5.2 修改 `src/ui/conversation.ts` — 支持渲染带链接的 MCP App 通知行
- [x] 5.3 在 tool execution end 事件处理中触发 app 注册和通知显示

## 6. 示例项目

- [x] 6.1 创建 `examples/scenario-modeler/package.json` — 最小依赖（@modelcontextprotocol/sdk, express, cors）
- [x] 6.2 创建 `examples/scenario-modeler/server.ts` — MCP Server（业务逻辑 + tool 注册 + resource 注册 + HTTP/stdio 启动）
- [x] 6.3 创建 `examples/scenario-modeler/mcp-app.html` — 单文件 View（CSS + 手写 postMessage + Canvas 图表 + DOM UI）
- [x] 6.4 创建 `examples/scenario-modeler/README.md` — 使用说明
- [x] 6.5 创建 `examples/scenario-modeler/.gitignore`

## 7. 构建与验证

- [x] 7.1 修改 `scripts/build.mjs` — 将 `sandbox.html` 复制到 `dist/`
- [x] 7.2 运行 `npm run typecheck` 确保零错误
- [x] 7.3 在 `examples/scenario-modeler/` 运行 `npm install && npm start` 验证 Server 启动
- [x] 7.4 编写集成测试最小 case：启动 MCP Server → dscode 连接 → 调用 tool → 验证 TUI 通知
