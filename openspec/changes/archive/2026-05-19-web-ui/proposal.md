## Why

目前 dscode 仅有 TUI（终端交互）版本，用户必须在终端中操作，对不熟悉命令行的用户门槛较高，也无法在移动设备或浏览器环境中使用。提供一个 Web 版本能让更多用户便捷地使用 dscode 的全部功能，扩大受众面，同时保持与 CLI 版本一致的能力深度。

## What Changes

- **新增 Web 服务器**：基于 Node.js HTTP 服务器的 Web 后端，复用现有 Harness 全部层级（Agent Loop、Session、Context、Memory、Skills、Permissions、MCP）
- **新增 Web 前端**：单页应用（SPA），提供简洁舒适的现代化 UI，完整呈现 TUI 的所有交互功能
- **WebSocket 实时通信**：通过 WebSocket 实现流式输出（thinking + text delta）、工具调用状态、权限弹窗等实时交互
- **会话管理界面**：可视化的会话列表、切换、保存、加载、删除
- **Slash 命令面板**：将 TUI 的 `/` 命令转化为图形化的命令面板和快捷操作
- **MCP 浏览器面板**：可视化浏览 MCP 服务器和工具列表
- **配置管理界面**：图形化的模型切换、API Key 设置、thinking level 调整
- **图片上传支持**：支持拖拽/粘贴/点击上传图片，替代 CLI 的 `/image` 命令
- **权限确认弹窗**：将 TUI 的键盘选择转化为图形化的确认对话框

## Capabilities

### New Capabilities

- `web-server`: HTTP + WebSocket 服务器，负责服务静态前端资源、处理 API 请求、通过 WebSocket 转发 Agent 事件流
- `web-frontend`: 单页 Web 前端应用，包含对话界面、侧边栏、命令面板、设置面板、MCP 浏览器等全部 UI 组件
- `websocket-protocol`: WebSocket 消息协议定义，涵盖流式文本 delta、thinking、工具调用开始/结束、权限请求/响应、系统消息等事件类型

### Modified Capabilities

<!-- 现有 spec 无需修改，Web 版本是新增能力，在 Harness 层之上增加新的 UI 通道，不影响现有各层的行为 -->

## Impact

- **新增依赖**：前端框架（React/Vue）、构建工具（Vite）、WebSocket 库（ws）、HTTP 服务器
- **Harness 层**：需小幅度重构以支持多个 UI 后端（CLI + Web），主要是抽象 UI 接口
- **现有代码**：`src/core/harness.ts` 需要支持双模式启动（`--web` 参数）；`src/ui/` 下新增 `web/` 目录
- **构建流程**：新增前端构建步骤，与现有 `scripts/build.mjs` 集成
- **无破坏性变更**：CLI 模式保持不变，Web 模式通过 `--web` 或 `--web-port` 参数启动
