## 1. UiBackend 接口抽象与 Harness 重构

- [x] 1.1 定义 `src/ui/backend.ts` 中的 `UiBackend` 接口，包含所有 UI 回调方法（对话渲染、系统消息、权限、图片、加载状态、MCP 等）
- [x] 1.2 创建 `src/ui/tui-backend.ts`，将现有 `TuiApp` 封装为 `UiBackend` 接口实现，保持 CLI 行为不变
- [x] 1.3 重构 `src/core/harness.ts`，将 `TuiApp` 的直接依赖替换为 `UiBackend` 接口，构造函数或 `run()` 方法接收 `UiBackend` 实例
- [x] 1.4 重构 `src/core/main.ts`，根据 `--web` 参数选择创建 `TuiBackend` 或 `WebUiBackend`
- [x] 1.5 验证 CLI 模式：确保 `dscode`（无参数）启动后 TUI 所有功能正常

## 2. WebSocket 协议与 WebUiBackend 实现

- [x] 2.1 在 `src/ui/web/` 下创建 `protocol.ts`，定义所有 WebSocket 消息类型（ClientCommand 和 ServerEvent 的 TypeScript 类型）
- [x] 2.2 创建 `src/ui/web/ws-server.ts`，实现 WebSocket 服务器（基于 `ws` 库），处理连接、断开、消息收发
- [x] 2.3 创建 `src/ui/web/web-backend.ts`，实现 `WebUiBackend` 类（实现 `UiBackend` 接口），将所有 UI 回调转化为 WebSocket 事件广播
- [x] 2.4 实现权限确认的 WebSocket 双向交互：`permission_prompt` 事件发送后挂起 Agent 执行，等待客户端 `permission` 命令响应
- [x] 2.5 实现 Slash 命令的 WebSocket 处理：客户端发送 `slash` 命令，服务端调用 `executeSlashCommand`
- [x] 2.6 实现 Abort 支持：客户端发送 `abort`，服务端调用 `agent.abort()`
- [x] 2.7 连接就绪时发送初始状态：模型名、当前配置、对话历史通过 `ready` 事件同步

## 3. HTTP 服务器与 REST API

- [x] 3.1 创建 `src/ui/web/http-server.ts`，实现 HTTP 服务器（基于 Node.js `http` 模块），集成 WebSocket 升级
- [x] 3.2 实现静态文件服务：从 `dist/web/` 提供 SPA 资源，SPA fallback 路由
- [x] 3.3 实现 `GET /api/config` 端点：返回当前配置（模型、thinking level、API key（脱敏）、项目路径）
- [x] 3.4 实现 `GET /api/sessions` 端点：返回保存的会话列表
- [x] 3.5 实现 `GET /api/conversation` 端点：返回当前会话的完整对话历史
- [x] 3.6 添加 CLI 参数 `--web` 和 `--web-port`，注册到 `src/core/main.ts`

## 4. 前端项目搭建

- [x] 4.1 在项目根目录创建 `web/` 前端目录，使用 Vite + React + TypeScript 初始化
- [x] 4.2 配置 Tailwind CSS，设置 dscode 品牌色系（深蓝 + 青色为主色调）
- [x] 4.3 配置 Vite 构建输出到 `dist/web/`，设置 base path
- [x] 4.4 创建基础布局组件：`AppLayout`（侧边栏 + 主内容区）、响应式断点
- [x] 4.5 实现主题系统：浅色/深色双主题，跟随系统偏好，手动切换，localStorage 持久化

## 5. 前端核心功能 - 对话与流式渲染

- [x] 5.1 实现 `useWebSocket` Hook：WebSocket 连接管理、自动重连、消息解析与分发
- [x] 5.2 创建 `ChatView` 组件：对话消息列表、自动滚动到底部、用户消息和助手消息样式
- [x] 5.3 实现流式文本渲染：`text_delta` 事件实时追加到当前助手消息气泡
- [x] 5.4 实现 Thinking 块渲染：`thinking_delta` 事件渲染为可折叠的灰色区块
- [x] 5.5 实现工具调用卡片：`tool_start` / `tool_end` 渲染为内联卡片，显示工具名、参数、结果预览、成功/失败图标
- [x] 5.6 创建 `MessageInput` 组件：文本输入框、Enter 发送、Shift+Enter 换行、发送按钮

## 6. 前端核心功能 - 权限与交互

- [x] 6.1 创建 `PermissionDialog` 组件：模态弹窗显示工具名和操作预览，Allow / Always Allow / Deny 按钮
- [x] 6.2 创建 Loader 指示器：处理中状态时显示加载动画，支持取消按钮（abort）
- [x] 6.3 实现 Slash 命令面板：输入 `/` 时弹出命令列表下拉，支持键盘导航和点击选择
- [x] 6.4 创建 Toast 通知组件：info 消息自动消失（3 秒），error 消息需手动关闭

## 7. 前端功能 - 图片上传

- [x] 7.1 实现拖拽上传：对话区域接受 drag & drop，提取图片文件
- [x] 7.2 实现粘贴上传：监听 paste 事件，提取剪贴板中的图片数据
- [x] 7.3 实现点击上传：附件按钮触发文件选择器
- [x] 7.4 创建图片预览缩略图：已附加图片显示缩略图和文件名，支持移除
- [x] 7.5 图片数据通过 WebSocket `chat` 命令的 `images` 字段（base64）发送

## 8. 前端功能 - 侧边栏（会话管理 + MCP 浏览器 + 配置）

- [x] 8.1 创建 `Sidebar` 容器组件：标签页切换（Sessions / MCP / Settings）
- [x] 8.2 实现会话管理面板：会话列表、保存当前会话、加载会话、删除会话（需确认）
- [x] 8.3 实现 MCP 浏览器面板：服务器列表（含连接状态图标）、点击展开工具列表
- [x] 8.4 实现配置面板：模型下拉选择、Thinking Level 选择、API Key 输入（脱敏显示）
- [x] 8.5 实现连接状态指示器：WebSocket 已连接/重连中状态图标

## 9. 构建与集成

- [x] 9.1 添加 `ws` 依赖到 `package.json`
- [x] 9.2 添加前端依赖：`react`、`react-dom`、`tailwindcss`、`@tailwindcss/typography` 等到 `web/package.json`
- [x] 9.3 更新 `scripts/build.mjs`：增加前端构建步骤（`cd web && npm run build`）或创建独立构建脚本
- [x] 9.4 更新 `package.json` scripts：添加 `build:web`、`dev:web` 命令
- [x] 9.5 确保 `dscode --web` 在生产构建后能找到 `dist/web/` 下的前端文件
- [x] 9.6 添加开发模式：Vite dev server 代理 WebSocket 到后端，支持 HMR

## 10. 测试与验证

- [ ] 10.1 端到端验证：启动 `dscode --web`，浏览器打开后完成一次完整对话（含流式输出、thinking、工具调用）
- [ ] 10.2 验证权限确认流程：触发危险命令 → 弹窗确认 → 允许/拒绝
- [ ] 10.3 验证会话管理：保存 → 清空 → 加载 → 恢复对话
- [ ] 10.4 验证 MCP 浏览器：展示已连接的 MCP 服务器和工具
- [ ] 10.5 验证图片上传：拖拽/粘贴/点击三种方式各测试一次
- [ ] 10.6 验证 Slash 命令：`/help`、`/config`、`/reset` 等命令通过面板和直接输入均可触发
- [ ] 10.7 验证响应式布局：桌面端和移动端（< 768px）布局正常
- [ ] 10.8 验证深色/浅色主题切换
- [ ] 10.9 验证 WebSocket 断线重连后状态恢复
- [ ] 10.10 验证 CLI 模式不受影响：`dscode`（无 --web）所有现有功能正常
