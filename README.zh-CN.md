<p align="center">
  <img src="docs/assets/dscode-logo.svg" alt="dscode" width="460" />
</p>

<p align="center">
  <strong>
    内容驱动的数字创作工作室。<br />
    编程、写作、设计、构建 —— 与一个像创作者一样思考的 AI。
  </strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@creative-dswork/dscode"><img src="docs/assets/badge-npm.svg" alt="npm version" /></a>
  <img src="docs/assets/badge-node.svg" alt="Node.js >=20" />
  <img src="docs/assets/badge-deepseek.svg" alt="DeepSeek native" />
  <img src="docs/assets/badge-spec-driven.svg" alt="spec driven" />
</p>

<p align="center">
  <sub><a href="README.md">English</a></sub>
</p>

---

<p align="center">
  <img src="docs/assets/work-main-ui.png" alt="dscode — editorial workshop" width="800" />
</p>

> dscode 编辑工作室 —— 一个融合代码、设计与对话的创作空间。

---

## dscode 有什么不同

<table>
<tr>
<td width="50%" valign="top">

### 🔌 MCP-First

数字工作室不用一个工具，而是十个。MCP 把每一个工具变成 API —— dscode 就是编排它们的 Agent。Blender 做 3D 建模、PlayCanvas 做实时渲染、浏览器自动化做测试、文档做规约、电子表格做数据。只要你的创作工具有 MCP Server，dscode 就能把它接入工作流。

**你的工具链。一个 Agent。全通过 MCP。**

</td>
<td width="50%" valign="top">

### 🧬 Spec-Driven 开发

dscode 通过 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 实现**规约驱动开发（SDD）**。每个功能先有正式 spec——`openspec/specs/` 是唯一真相源，代码只是实现。我们不鼓励手动提交；所有设计和开发都在 SDD 管线中完成，由 AI Agent 协作实现。

**代码是规约的实现 —— 而不是反过来。**

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔍 MCP Tool Search

MCP Server 太多导致上下文爆炸？dscode 内置 `search_tools` 驱动——MCP 工具由模型**按需发现**，而非预加载。只有真正需要的工具才会进入上下文窗口。接入几十个 MCP Server 也无需担心 token 开销。

**所有工具，零浪费。**

</td>
<td width="50%" valign="top">

### 🎨 编辑工作室

dscode 不是一个带有暗色主题的聊天机器人。它是一个**数字工作室** —— 具有编辑级排版、宽敞留白和温暖工具感美学的创作空间。界面为创作者设计：阶段标签消息组、衬线结构标签、侧边栏详情面板，Dashboard 是 Chat 的一种模式而非独立页面。每个像素都有存在的理由。

**创作空间。不只是聊天窗口。**

</td>
</tr>
</table>

---

## 能力一览

<table>
<td width="33%" valign="top">
  <strong>🖥 终端 + Web 双界面</strong><br />
  <sub>完整 TUI：流式输出、thinking、工具调用，逐轮 token 用量与成本统计。现代 React Web 界面，通过 WebSocket 实现功能完全一致。</sub>
</td>
<td width="33%" valign="top">
  <strong>🔌 MCP 连接器</strong><br />
  <sub>Stdio、Streamable HTTP（MCP 2025-11-25）、Legacy SSE 兼容。自动传输推断。MCP App 沙箱支持服务端驱动 UI。</sub>
</td>
<td width="33%" valign="top">
  <strong>🛡 Agent Harness</strong><br />
  <sub>OS 风格 Agent 进程、Agent.md 应用配置、前后台执行、进程控制、Worktree 隔离、权限和持久化。</sub>
</td>
</tr>
<tr>
<td width="33%" valign="top">
  <strong>📦 Skills 系统</strong><br />
  <sub>通过 SKILL.md 声明式定义第三方扩展。按需激活。用户级 + 项目级双重作用域。</sub>
</td>
<td width="33%" valign="top">
  <strong>👁 Vision Pipeline</strong><br />
  <sub>由 vision.md 配置的 Pipeline SubAgent，支持原生多模态路由、OCR 回退、进度和取消。</sub>
</td>
<td width="33%" valign="top">
  <strong>🔧 Open Design</strong><br />
  <sub>AI 驱动的视觉设计工作台，支持前端生成、图片转代码、设计系统管理。通过 MCP 集成。</sub>
</td>
</tr>
<tr>
<td width="33%" valign="top">
  <strong>🎬 Dashboard 与动效</strong><br />
  <sub>Chat↔Dashboard 级联过渡动画，物理驱动的 "dscode" 集群动效。会话仪表盘含上下文窗口用量条。</sub>
</td>
<td width="33%" valign="top">
  <strong>📐 Hash-Anchor 编辑</strong><br />
  <sub>内容寻址的文件编辑，3 级自适应哈希解析、原子批量操作、检查点安全回滚、结构化失效范围。</sub>
</td>
<td width="33%" valign="top">
  <strong>🔁 重试与韧性</strong><br />
  <sub>指数退避与可配置重试策略。透明处理频率限制、超时和服务端错误，遵循 Retry-After 响应头。</sub>
</td>
</tr>
</table>

> **提示：** TUI 中粘贴剪贴板图片用 `Ctrl+V`（macOS）或 `/image clipboard`。

---

## 30 秒上手 MCP

```jsonc
// ~/.dscode/settings.json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    }
  }
}
```

dscode 启动时自动连接，工具以 `mcp_blender_*` 和 `mcp_playwright_*` 命名空间出现。MCP Server 还可通过 App Host 提供沙箱化 UI —— 无需样板代码，无需 SDK，无需胶水层。

### MCP 实战效果

<table align="center">
<tr>
<td align="center" width="50%">
  <video src="https://github.com/user-attachments/assets/917414f9-9f39-457e-9358-98f6abe01220" controls width="100%"></video>
  <br /><sub><b>PlayCanvas + MCP</b> — 纯自然语言构建一个跳跃小游戏</sub>
</td>
<td align="center" width="50%">
  <video src="https://github.com/user-attachments/assets/cf62021e-bb1c-4aa3-953d-b0d09631a1ef" controls width="100%"></video>
  <br /><sub><b>Blender + MCP</b> — 对话式 3D 建模与场景搭建</sub>
</td>
</tr>
</table>

> **提示：** 视频可直接播放——以上为真实 MCP 工作流，点击观看。

---

## 安装

```bash
npm install -g @creative-dswork/dscode
dscode              # 终端模式
dscode --web        # Web 模式 → http://localhost:3000
```

> 首次使用？运行 `/config key <你的 API Key>` 和 `/config model deepseek-v4-pro` 即可开始。键入 `/help` 查看完整指南。

**从源码构建：**

```bash
git clone https://github.com/creativedswork/dscode.git
cd dscode && npm install && npm run build
node dist/dscode.mjs
```

---

## 配置

dscode 使用两层 `settings.json`，项目级配置覆盖用户级配置：

| 作用域 | 路径 | 用途 |
|-------|------|---------|
| 用户级 | `~/.dscode/settings.json` | 所有项目的默认配置 |
| 项目级 | `.dscode/settings.json` | 单个项目的覆盖配置 |

> **注意：** 模型配置（`provider`、`modelId`、`apiKey`、`thinkingLevel`）存放在 `~/.dscode/config.json`，通过 `/config` 命令管理。在会话中输入 `/help` 查看完整命令列表。

### 配置速览

```jsonc
// ~/.dscode/settings.json
{
  // --- MCP 服务器 ---
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    },
    "my-api": {
      "url": "https://my-mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  },

  // --- 权限 ---
  "permissions": {
    "allow": [
      "Bash(git add *)",
      "Bash(npm *)"
    ],
    "deny": [
      "Bash(rm -rf *)"
    ],
    "rules": [
      { "tool": "Bash(curl *)", "decision": "allow", "priority": 5 }
    ]
  },

  // --- Skills ---
  "skills": ["brandkit", "minimalist-ui"],

  // --- 重试 ---
  // 控制 dscode 如何在 API 调用失败时重试（限流、超时、服务器错误）。
  // 使用指数退避策略：从 baseDelayMs 开始，每次重试翻倍，上限为 maxDelayMs。
  "retry": {
    "maxRetries": 3,           // 最大重试次数
    "baseDelayMs": 1000,       // 首次重试前的初始延迟（毫秒）
    "maxDelayMs": 30000,       // 退避延迟的上限（毫秒）
    "retryOnTimeout": true,    // 提供商超时时重试
    "retryOnRateLimit": true,  // 触发限流时重试（遵循 Retry-After 头）
    "retryOnServerError": true // 5xx 服务器错误时重试
  },

  // --- @-文件 限制 ---
  "atFileMaxFiles": 5,
  "atFileMaxFileSize": 51200,
  "atFileMaxTotalSize": 204800
}
```

### MCP 服务器配置

`mcpServers` 下每个服务器支持以下字段：

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `command` | string | 可执行文件（用于 stdio 传输） |
| `args` | string[] | 传递给命令的参数 |
| `url` | string | HTTP 端点（用于 streamable-http 传输） |
| `env` | object | 服务器进程的额外环境变量 |
| `headers` | object | 自定义 HTTP 头 |
| `transport` | string | `"stdio"` \| `"streamable-http"` \| `"sse"`（省略时自动检测） |
| `preferredProtocolVersion` | string | `"2025-11-25"` \| `"2025-03-26"` \| `"2024-11-05"` |
| `requestTimeoutMs` | number | 单次请求超时时间 |
| `connectTimeoutMs` | number | 连接超时时间 |

> **提示：** 传输方式自动检测 —— 如果设置了 `url` 而没有 `command`，则使用 streamable-http，否则使用 stdio。

### 环境变量

所有配置均可通过环境变量设置，适用于 CI / 容器场景：

| 变量 | 对应配置 |
|----------|---------|
| `DEEPSEEK_API_KEY` | API Key（也支持 provider 专用变量：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 等） |
| `AGENT_PROVIDER` | Provider 覆盖 |
| `AGENT_MODEL` | Model 覆盖 |
| `AGENT_THINKING_LEVEL` | Thinking Level 覆盖 |
| `AGENT_VISION_PROVIDER` | Vision 模型 provider |
| `AGENT_VISION_MODEL` | Vision 模型 ID |
| `DSCODE_MAX_TOKENS` | 最大 token 数 |
| `DSCODE_CONFIG_HOME` | 自定义配置目录（默认：`~/.dscode`） |
| `DSCODE_DATA_HOME` | 自定义数据目录 |
| `DSCODE_PROJECT_PATH` | 项目目录 |
| `DSCODE_AGENTS_ENABLED` | Agent 进程工具开关，设为 `false` 回退单 Agent |
| `DSCODE_MANAGED_AGENTS_DIR` | 最高优先级的受管 Agent Application 目录 |
| `DSCODE_RETRY_MAX_RETRIES` | 重试最大次数 |
| `DSCODE_RETRY_BASE_DELAY_MS` | 重试基础延迟 |
| `DSCODE_RETRY_MAX_DELAY_MS` | 重试最大延迟 |

---


## Open Design

dscode 集成了 **[Open Design](https://github.com/wangcan26/open-design)** —— 一个 AI 驱动的视觉设计工作台，将前端生成能力直接带入你的工作流。可以把它理解为 Figma 与 AI 的结合：通过自然语言生成设计 token、组件和完整布局，支持实时预览与迭代。

### Open Design 为 dscode 提供的能力

- **视觉设计工作台** — 在 dscode 内直接创建、编辑和迭代前端设计
- **图片转代码** — 从设计稿生成可用于生产的 HTML/CSS
- **设计系统管理** — 跨项目维护一致的 design token、字体层级和色彩体系
- **多文件 Artifact 生成** — 产出结构化的完整前端项目文件树

### 安装

```bash
git clone https://github.com/wangcan26/open-design.git
cd open-design
npm install
```

然后在 `~/.dscode/settings.json` 中配置 MCP 服务器：

```jsonc
{
  "mcpServers": {
    "open-design": {
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/open-design/apps/daemon/src/cli.ts",
        "mcp",
        "--daemon-url",
        "http://127.0.0.1:7456"
      ]
    }
  }
}
```

> **注意：** Open Design 对 dscode 的集成目前位于 `add-dscode-agent` 分支，尚未向上游提交 PR。该集成提供了 dscode 专属的 installer 目标和 agent 配置。关注进展请访问 [github.com/wangcan26/open-design](https://github.com/wangcan26/open-design)。

---

## 参与方式

dscode 目前是单人 SDD 开发项目，暂不接受直接的代码贡献（Pull Request）。

欢迎通过 **[GitHub Issues](https://github.com/creativedswork/dscode/issues)** 提交 bug 报告、功能建议和技术讨论。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

| [CONTRIBUTING.md](CONTRIBUTING.md) | 参与方式说明 & SDD 工作流介绍 |

## 了解更多

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 完整架构：Agent as OS、6 层设计、Driver/Skill 模型、源码树 |
| [AGENT_APPLICATIONS.md](docs/AGENT_APPLICATIONS.md) | Agent.md 目录、字段、Claude Code 兼容和进程工具 |
| [ROADMAP.md](docs/ROADMAP.md) | Agent 进程扩展、评测和编辑能力路线图 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南：理念对齐、OpenSpec SDD 流程、编码规范 |
| [STYLE.md](docs/STYLE.md) | TypeScript 编码风格：命名、导入、模块结构、错误处理 |

---

## 致谢

dscode 站在以下工作的肩膀上：

- **[OpenSpec](https://github.com/Fission-AI/OpenSpec)** — 规约驱动开发框架，塑造了我们的整个工作流

- **[pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) / [pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core)** — Mario Zechner 的 agent 循环与模型抽象基础
- **[taste-skill](https://github.com/Leonxlnx/taste-skill)** — Leonxlnx 的设计品味技能系统，启发了我们的 skills 架构
- **[@_can1357](https://x.com/_can1357/status/2021828033640911196)** — hash-anchor 编辑协议，成为我们 `edit` 工具的基石

---

<p align="center">
  <sub>如果你喜欢这个项目，请给一个 ⭐ Star —— 你的支持让 dscode 持续进化。</sub>
</p>
