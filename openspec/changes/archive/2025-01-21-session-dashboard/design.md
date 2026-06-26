## Context

当前 Web UI 无 LLM 生成的结构化内容渲染能力。所有输出都是消息气泡形式（文本 + thinking + tool cards）。引入 Artifact 系统后，LLM 可以生成完整的 HTML 页面，通过 WebSocket 流式推送，前端在 iframe sandbox 中渲染。

Dashboard 是 Artifact 系统的首个 consumer。`.dscode/html_output_skill` 文件作为项目级风格约束，确保 LLM 生成的 HTML 视觉一致、不随机。

## Goals / Non-Goals

**Goals:**
- 定义通用的 Artifact 协议（`artifact_start` / `artifact_delta` / `artifact_end` + `artifact` command），可复用于 Dashboard 之外的场景
- Dashboard 由独立异步 LLM 生成，不阻塞主 agent
- 前端在 iframe sandbox 中渲染 artifact HTML，隔离样式和脚本
- `.dscode/html_output_skill` 约束生成风格，保持输出一致性
- Dashboard 模式下通过聊天自然语言操控 artifact（纯指令模式，不污染对话历史）
- Header 提供 Chat / Dashboard 视图切换

**Non-Goals:**
- 不支持 artifact 内嵌 JavaScript（sandbox 禁用脚本）
- 不支持多个 artifact 并存（首版单 artifact）
- 不持久化 artifact 状态到 session 文件
- Dashboard 切换不回退到 Chat 时 artifact 内容不保留（每次切换重新触发 generate）

## Decisions

### 1. Artifact 协议设计

**决策**：Server 端三个事件：

| 事件 | 方向 | 语义 |
|------|------|------|
| `artifact_start` | S→C | artifact 生成开始，前端清空当前 HTML |
| `artifact_delta | delta: string` | S→C | 流式 HTML 片段，前端拼接后写入 iframe |
| `artifact_end` | S→C | artifact 完成，前端最终渲染 |

Client 端一个 command：

| Command | 方向 | 语义 |
|---------|------|------|
| `artifact | action: "generate", context: string` | C→S | 发起 artifact 生成，context 告知用途（如 `"session_dashboard"`） |
| `artifact | action: "update", instruction: string` | C→S | 基于当前 artifact HTML + 用户指令重新生成 |

**理由**：
- 与现有 `thinking_delta` / `text_delta` 流式模式一致，前端可复用已有流式处理逻辑
- `context` 字段让后端选择不同的 prompt 模板（未来可扩展 `context: "code_review"` 等）
- 无 `artifactId` 字段——首版单 artifact，简化实现

**替代方案**：带 `artifactId` 的多 artifact 协议——增加复杂度，当前无多 artifact 场景需求

### 2. iframe Sandbox 渲染

**决策**：前端使用 `iframe` 的 `srcdoc` 属性注入 HTML，`sandbox="allow-same-origin"`（不开启 `allow-scripts`）。

**理由**：
- iframe 天然隔离 CSS，artifact 内部样式不会污染主页面
- 禁止脚本执行，安全边界清晰
- `srcdoc` 无需额外 server 路由

**替代方案**：`dangerouslySetInnerHTML` + Shadow DOM —— 样式隔离不如 iframe 彻底，且 XSS 风险更高

### 3. 独立异步 LLM 调用

**决策**：artifact 的生成/更新请求不经过主 agent 的对话循环。后端收到 `artifact` command 后，启动独立的 LLM 调用（可复用当前 provider 配置但独立管理上下文），不修改 `conversation messages`。

Prompt 构建：
```
系统提示（含 html_output_skill 内容）
  +
Session 数据摘要（messages, tokens, tools, timing 的结构化 JSON）
  +
用户指令（如有）
  =
LLM → 流式 HTML
```

**理由**：
- 不阻塞主 agent 对话——用户在 Dashboard 模式下修改 artifact 时，Chat 状态完全不受影响
- artifact 的上下文独立管理，不污染对话历史的 token 预算
- 未来可实现 Dashboard 和 Chat 并行：用户在 Dashboard 模式等 artifact 生成时，切回 Chat 继续对话

**替代方案**：artifact 指令作为特殊 slash command 注入对话——耦合主 agent 上下文，且 artifact 更新会消耗对话 token 预算

### 4. `html_output_skill` 文件

**决策**：后端在构建 artifact prompt 时，检查项目根目录 `.dscode/html_output_skill` 文件是否存在。若存在，将其内容作为系统提示的「Artifact 风格约束」部分注入。

文件内容示例（自由格式，由用户/项目定义）：
```markdown
## Style Rules
- Use warm dark palette: bg #1e1c19, surface #282622, accent #e8a850
- Font: system-ui for body, monospace for data values
- No shadows, no gradients, flat borders 1px solid
- Max width 100%, responsive grid
```

**理由**：
- 将风格约束从代码中解耦，用户/项目可按需定制
- 不影响默认行为（文件不存在时 LLM 自主发挥）
- 与 `.claude/settings.json` 等配置文件的定位一致——项目级约定

### 5. Dashboard 模式下 MessageInput 纯指令模式

**决策**：当 `viewMode === "dashboard"` 时，MessageInput 的行为变更：
- 用户输入不调用 `handleSend`（不走 chat 流程）
- 改为调用 `handleArtifactUpdate(instruction)` → 发送 `{ type: "artifact", action: "update", instruction }`
- 输入框 UI 不变（仍可输入、回车发送），但 placeholder 文案变为 "Describe how to modify the dashboard..."
- 不显示 slash commands 面板

**理由**：
- 用户心智模型："我在对 Dashboard 说话，不是对 agent 说话"
- 指令不进入对话历史，切换回 Chat 后对话完整无损
- 未来可扩展：其他 artifact context 也可复用此模式

### 6. ViewModeSwitcher 放置与行为

**决策**：与前一版设计一致——Header 右侧，ThemeToggle 左侧。切换时：
- Chat → Dashboard：自动发送 `{ type: "artifact", action: "generate", context: "session_dashboard" }`，触发独立 LLM 生成初始 Dashboard
- Dashboard → Chat：不保留 artifact HTML（下次切回 Dashboard 重新生成）
- 默认：`viewMode = "chat"`

## Risks / Trade-offs

- **[LLM 生成非确定性]** 相同 session 数据两次生成的 Dashboard 外观不同 → `html_output_skill` 约束 + 用户可随时通过指令修正
- **[iframe 通信开销]** artifact 内部无法访问前端 state → 设计上 artifact 是完全独立的静态 HTML，所有数据在生成时已内嵌
- **[独立 LLM 调用成本]** 每次 generate/update 消耗额外 token → generate 仅在切换到 Dashboard 时触发一次，update 由用户主动发起
- **[artifact 生成延迟]** 独立 LLM 调用可能需要数秒 → 前端显示加载状态（骨架屏或 spinner），不阻塞 UI
- **[无脚本导致交互受限]** 无法做图表动画/交互式筛选 → 首版接受静态 HTML，未来可评估 `allow-scripts` + CSP
