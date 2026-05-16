## Context

dscode 是基于 `@mariozechner/pi-agent-core` 的 TUI CLI Agent。当前架构支持 MCP Server 连接（stdio/SSE），工具以 Driver→Tool 模式暴露给 Agent Loop。基础设施完备：`MCPManager`、`MCPClient`、`ToolRegistry`、`DriverRegistry` 均已存在。

MCP Apps（SEP-1865，extension id: `io.modelcontextprotocol/ui`）是 MCP 协议的标准扩展：
- **Server 端**：Tool 通过 `_meta.ui.resourceUri` 关联 UI resource（`ui://` scheme），通过 `_meta.ui.visibility: ["model" | "app"]` 控制可见性
- **Host 端**：sandboxed iframe 渲染 HTML View，postMessage JSON-RPC 双向通信
- **核心约束**：dscode 是 TUI，无浏览器 DOM / iframe 能力

**现有代码涉及模块**：
- `src/mcp/client.ts`: MCP JSON-RPC 客户端，stdio/SSE transport，`initialize()` → `listTools()` → `callTool()`
- `src/mcp/manager.ts`: 管理多个 MCPClient，`registerDrivers()` 将 tool 注册为 Driver
- `src/mcp/types.ts`: `MCPServerConfig`, `MCPToolDefinition`
- `src/drivers/tool-registry.ts`: 延迟加载工具机制（base tools + deferred tools），`search_tools` 搜索
- `src/core/harness.ts`: 组装所有组件，Agent 循环
- `src/ui/tui-app.ts`: TUI 渲染，字符界面

## Goals / Non-Goals

**Goals:**
1. dscode 作为 MCP Apps-compatible Host：声明 ui capability，正确处理 `_meta.ui`
2. 过滤 app-only tools（`visibility: ["app"]`）不暴露给 LLM
3. 检测 UI-enabled tools，获取 UI resource HTML
4. 本地 sandbox HTTP Server 托管 HTML View，提供 postMessage ↔ HTTP bridge
5. TUI 显示 MCP App 访问 URL
6. `examples/scenario-modeler/` 完整示例，可运行的 MCP App（Server + View）

**Non-Goals:**
- 不在 TUI 内渲染 HTML/iframe（终端无法做到）
- 不提供完整的 View ↔ Host 双向通信（L1 仅基本 bridge）
- 不支持主题系统（CSS variables 由 sandbox 自行 fallback）
- 不支持 display mode 切换（inline/fullscreen/pip）
- 不实现 double-iframe sandbox（单层 sandbox proxy 足够）
- 不使用 `@modelcontextprotocol/ext-apps` SDK（手写协议展示底层机制）

## Decisions

### 1. Capability negotiation: 声明而非沉默
**选择**: `MCPClient.connect()` 时声明 `io.modelcontextprotocol/ui` capabilities，mimeTypes: `["text/html;profile=mcp-app"]`

**备选**: 不声明，Server 检测无支持后降级纯文本。但这样就拿不到 `_meta.ui` 信息，无法生成 URL。

**理由**: 声明后 Server 会返回完整的 tool metadata，dscode 可以获得 resourceUri，在 TUI 中展示打开链接。这是 Progressive Enhancement 的正向实现。

### 2. Sandbox 架构: 单层 proxy + srcdoc
**选择**: dscode 提供 `sandbox.html` 作为 postMessage proxy，内层用 `srcdoc` 加载 MCP App HTML

```
浏览器                             dscode HTTP Server (127.0.0.1:random)
  │                                       │
  │ GET /app/:id?html=base64...          │
  │ ──────────────────────────────────────► │
  │ ◄── 200 sandbox.html (CSP header)     │
  │                                       │
  │ POST /api/bridge/:id                  │
  │ ──────────────────────────────────────► │
  │ ◄── JSON-RPC response                 │
```

**备选**: 双层 iframe（规范推荐）。需要两个不同 origin 的 iframe，本地实现复杂度过高。

**理由**: 单层 proxy + CSP header + srcdoc 已提供足够隔离。内层 View 通过 srcdoc 加载 → origin = null → 无法访问任何 origin 相关的 API。CSP 通过 HTTP header 设置（不可被 View 覆盖）。

### 3. Bridge 通信: HTTP POST + SSE
**选择**: sandbox.html 内层 View 的 postMessage → Proxy 转 HTTP POST，Host → View 通过 SSE 推送

**备选**: WebSocket。Node.js 需要额外依赖（`ws`）。

**理由**: SSE + POST 都是 `node:http` 原生支持，零额外运行时依赖。SSE 足够覆盖 Host → View 的单向推送需求。

### 4. App-only tool 过滤: 在 ToolRegistry 层处理
**选择**: `MCPManager` 收集 app-only tool names → `ToolRegistry.initialize()` 排除它们

**备选**: 在 MCPManager 层过滤。但 ToolRegistry 已有完善的延迟加载机制，在它内部处理更集中。

**理由**: 保持 ToolRegistry 作为「什么工具暴露给 LLM」的唯一决策点。

### 5. 示例: 单 HTML 文件 + 纯 MCP SDK
**选择**: `mcp-app.html` 全内联（CSS + JS + HTML），零外部依赖；`server.ts` 仅用 `@modelcontextprotocol/sdk`

**备选**: 从 ext-apps 复制完整项目（React + Vite + Chart.js + TypeScript）

**理由**: dscode 的 example 应低门槛。用户 `npm start` 即可运行，无需配置构建工具。手写 postMessage 协议展示 MCP Apps 底层，不隐藏在任何 SDK 后面。

### 6. View 端图表: Canvas API 代替 Chart.js
**选择**: 原生 Canvas 2D API 画折线图（仅 3 条线，12 个数据点）

**备选**: 引入 Chart.js CDN（~60KB gzip）

**理由**: 场景只需简单折线图，Canvas API ~80 行代码即可完成。避免外部 CDN 依赖（CSP 要额外声明 domain）。

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| 本地 HTTP Server 增加攻击面 | 恶意本地进程可访问 sandbox 页面 | 仅 bind 127.0.0.1，随机端口，CSP header 默认零网络 |
| 单层 sandbox 不如双层安全 | 理论上 origin 攻击向量更多 | View 用 srcdoc 加载（origin=null），CSP HTTP header 强制 |
| SSE bridge 不支持 full-duplex | View 需频繁调 tool 时有延迟 | 每个请求独立 HTTP POST，SSE 仅用于 Server push（很少用） |
| Canvas API 折线图不如 Chart.js 美观 | 无 tooltip、动画、响应式 | Scenario modeler 场景简单（3 线 12 点），够用 |
| 无 typed structuredContent | View 端类型安全缺失 | JS 手写，运行时 duck typing，示例场景数据简单 |
| sandbox.html 随 dscode 打包分发 | 路径解析可能出问题 | 多候选路径查找：cwd、import.meta.url、全局 node_modules |
