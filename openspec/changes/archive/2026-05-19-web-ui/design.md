## Context

dscode 目前是纯 TUI 应用，使用 `@earendil-works/pi-tui` 渲染终端界面。Harness（`src/core/harness.ts`）直接实例化 `TuiApp` 并与之耦合。要支持 Web 界面，需要在 Harness 与 UI 之间引入抽象层，使同一套 Agent 逻辑可以驱动不同的 UI 后端。

当前架构：
```
main.ts → Harness → [Agent + 各层级] → TuiApp (pi-tui)
```

目标架构：
```
main.ts → Harness → [Agent + 各层级] → UiBackend (interface)
                                           ├── TuiApp (CLI, 现有)
                                           └── WebUiBackend (新增)
                                                  ├── HTTP Server (静态资源 + REST API)
                                                  └── WebSocket Server (实时事件流)
                                                        ↕
                                                   React SPA (浏览器)
```

## Goals / Non-Goals

**Goals:**
- 抽象 `UiBackend` 接口，使 Harness 不依赖具体 UI 实现
- 实现 Web 版本，完整复现 TUI 所有交互功能（对话、流式输出、thinking、工具调用、权限确认、slash 命令、MCP 浏览、配置管理、图片上传、会话管理）
- WebSocket 实时双向通信，支持流式文本 delta、thinking 展示、工具调用状态
- 前端界面简洁现代，响应式布局，适合桌面和移动端
- CLI 模式保持完全不变，`dscode` 默认行为不变，新增 `--web` 参数启动 Web 模式
- 复用现有所有层级（Session、Context、Memory、Skills、Permissions、MCP），不做任何行为变更

**Non-Goals:**
- 不修改现有 TUI 的功能或行为
- 不做多用户支持（单用户、单会话，与 CLI 一致）
- 不做用户认证/授权
- 不重构 Agent loop 或工具执行逻辑
- 不做 SSE 或 HTTP polling（统一走 WebSocket）

## Decisions

### 1. UI 抽象层：`UiBackend` 接口

**决策**：定义 `UiBackend` 接口，包含 Harness 需要的所有 UI 回调方法。`TuiApp` 和 `WebUiBackend` 各自实现。

**替代方案**：
- 事件总线（EventEmitter）：让 Harness emit 事件，UI 订阅。但是 Harness 有 `getPromptPermission()` 这种需要返回值的方法，纯事件不够用。
- 不抽象，Web 模式另起 `WebHarness`：代码重复过多，后续维护成本高。

**接口设计**（核心方法）：
```typescript
interface UiBackend {
  // 生命周期
  start(): Promise<void>;
  waitForExit(): Promise<void>;
  shutdown(): Promise<void>;

  // 对话渲染
  addUserMessage(text: string): void;
  startAssistantMessage(): void;
  thinkingDelta(delta: string): void;
  textDelta(delta: string): void;
  toolStart(name: string, args: unknown): void;
  toolEnd(name: string, result: unknown, isError: boolean): void;
  finishAssistantMessage(): void;

  // 系统消息
  addInfo(text: string): void;
  addError(text: string): void;

  // 权限
  getPromptPermission(): (toolName: string, preview: string, args: unknown) => Promise<PermissionPromptResult>;

  // 图片
  addPendingImage(image: ImageContent): void;
  clearPendingImages(): ImageContent[];

  // 控制
  focusEditor(): void;
  clearConversationView(): void;

  // MCP
  setMcpManager(mcpManager?: MCPManager): void;
  openMcpBrowser(): void;

  // 加载状态
  showLoader(text: string): void;
  hideLoader(): void;
  setLoaderText(text: string): void;
  setAbortHandler(handler: () => void): void;
}
```

### 2. WebSocket 协议设计

**决策**：基于 JSON 的简单消息协议，客户端到服务器叫 `Command`，服务器到客户端叫 `Event`。

**替代方案**：
- Server-Sent Events (SSE)：只支持单向推送，权限确认等需要双向交互时还要额外 HTTP 请求，增加复杂度。
- Socket.io：功能丰富但依赖重，dscode 目标是轻量 Harness，用原生 `ws` 库即可。

**消息类型**：

Client → Server (Commands):
```typescript
type ClientCommand =
  | { type: "chat"; text: string; images?: ImageAttachment[] }
  | { type: "abort" }
  | { type: "permission"; decision: "allow" | "always_allow" | "deny"; persistRule?: boolean }
  | { type: "slash"; command: string }
  | { type: "config"; key: string; value: string }
  | { type: "session"; action: "list" | "save" | "load" | "delete"; id?: string }
  | { type: "mcp"; action: "list" | "refresh" }
```

Server → Client (Events):
```typescript
type ServerEvent =
  | { type: "user_message"; text: string }
  | { type: "assistant_start" }
  | { type: "thinking_delta"; delta: string }
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; name: string; args: unknown }
  | { type: "tool_end"; name: string; result: string; isError: boolean }
  | { type: "assistant_end" }
  | { type: "info"; text: string }
  | { type: "error"; text: string }
  | { type: "permission_prompt"; toolName: string; preview: string }
  | { type: "loader"; state: "show" | "hide"; text?: string }
  | { type: "config"; data: ConfigData }
  | { type: "sessions"; data: SessionInfo[] }
  | { type: "mcp_state"; servers: McpServerInfo[] }
  | { type: "model"; name: string }
  | { type: "ready" }  // 连接就绪
```

### 3. 前端技术选型

**决策**：React 18 + Vite + Tailwind CSS

**替代方案**：
- Vue 3：同样优秀，但 React 生态更丰富，npm 下载量更高，社区组件更多。
- Svelte：编译体积小，但生态较小，不适合需要复杂状态管理的场景。
- 纯 HTML/JS：开发效率低，难以维护复杂交互状态。

**状态管理**：使用 React Context + useReducer，不引入 Redux/Zustand 等第三方库（状态不复杂，避免过度工程）。

**UI 风格**：简洁现代，浅色/深色双主题。参考 Claude/ChatGPT 的聊天界面布局，侧边栏 + 主对话区。

### 4. 构建与部署

**决策**：前端构建产物输出到 `dist/web/`，后端 server 代码与现有 TypeScript 源码一起编译。`dscode --web` 启动时，HTTP server 从 `dist/web/` 提供静态文件。

**替代方案**：
- 前端独立部署：增加运维复杂度，单机本地工具应自包含。
- 开发模式代理：`npm run dev:web` 启动 Vite dev server + 后端，前端 HMR 开发体验好。

### 5. Harness 重构策略

**决策**：`Harness.run()` 根据启动参数创建对应的 `UiBackend` 实现。构造时注入 `UiBackend`。

改动最小化：主要在 `src/core/harness.ts` 和 `src/core/main.ts` 两个文件。

## Risks / Trade-offs

- **[风险] WebSocket 连接断开时正在进行的 Agent 调用会丢失状态** → 服务器端保留 Agent 状态，客户端重连后通过 WebSocket 重新同步当前对话历史
- **[风险] 大体积前端 bundle 影响首次加载体验** → Vite 代码分割 + gzip 压缩，首次加载控制在 500KB 以内
- **[权衡] React 增加 node_modules 体积** → 仅 devDependencies，构建产物不包含 React 源码
- **[权衡] WebSocket 协议设计为 JSON 文本而非二进制** → 流式文本场景 JSON 开销可接受（每个 delta 一条消息），实现简单、可调试
- **[风险] 图片上传大文件可能导致内存压力** → 前端限制 20MB，base64 编码前校验
