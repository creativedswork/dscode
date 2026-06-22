## Why

当前 Web UI 仅有消息流视图，用户无法直观感知 session 的资源消耗（Token、耗时、工具调用），也无法在 Web UI 中获得 LLM 生成的结构化可视化内容。引入一个通用的 **Artifact 系统**——LLM 流式生成 HTML 内容并通过 WebSocket 下发，前端在沙箱中渲染——Dashboard 作为首个 consumer，让用户可以在 Chat 和 Dashboard 之间切换，并通过自然语言指令实时调整 Dashboard 展示。

## What Changes

- **新增 Artifact 协议**：WebSocket 新增 `artifact_start` / `artifact_delta` / `artifact_end` 事件类型，以及 client 端 `artifact` command（generate / update），实现 LLM 流式生成 HTML 内容的通用管道
- **新增 `.dscode/html_output_skill` 加载**：后端在生成 artifact 时将项目根目录的 `html_output_skill` 文件注入 prompt，约束 LLM 输出一致的视觉风格
- **新增 View Mode 切换**：Header 右侧添加 Chat / Dashboard 下拉选择器，控制主内容区渲染内容
- **新增 SessionDashboard（Artifact 容器）**：接收 `artifact_delta` 流式事件，在 iframe sandbox 中渲染 LLM 生成的 Dashboard HTML
- **Dashboard 模式下的 MessageInput**：纯指令模式——用户输入不进入对话历史，作为 `artifact update` 指令发送给后端，驱动 Dashboard 修改
- **独立异步 LLM 生成**：Dashboard 的初始生成和后续更新均为独立 LLM 调用，不阻塞、不干扰主 agent 对话

## Capabilities

### New Capabilities

- `artifact-system`: 通用 Artifact 协议与渲染管道——WebSocket 事件定义、client command、iframe sandbox 渲染、`html_output_skill` 注入
- `session-dashboard`: Session 数据可视化 artifact——由 LLM 根据 session 摘要（Token 用量、工具调用统计、耗时）自动生成 HTML Dashboard，不含消息内容（Chat 模式已展示）
- `session-view-mode`: 主内容区视图模式切换机制——Header 下拉选择器、Chat/Dashboard 互斥渲染、Dashboard 模式下纯指令输入

### Modified Capabilities

- `web-frontend`: Header 布局新增 ViewModeSwitcher；主内容区条件渲染 ChatView 或 ArtifactContainer；新增 artifact 事件处理链路
- `websocket-protocol`: 新增 `artifact_start` / `artifact_delta` / `artifact_end` server 事件，新增 `artifact` client command

## Impact

- **前端**：新增 `ArtifactContainer.tsx`（iframe sandbox）、`ViewModeSwitcher.tsx`；App.tsx 新增 `viewMode` 状态 + artifact 事件处理；MessageInput 在 Dashboard 模式下发送 `artifact` command
- **后端**：新增 artifact 命令处理、独立 LLM 调用管线、`html_output_skill` 文件读取与 prompt 注入
- **协议**：`ServerEvent` 新增 3 个事件类型，`ClientCommand` 新增 1 个 command
- **文件系统**：项目可选择性创建 `.dscode/html_output_skill` 文件来约束 artifact 生成风格
