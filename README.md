<p align="center">
  <img src="docs/assets/dscode-logo.svg" alt="dscode" width="460" />
</p>

<p align="center">
  <strong>The open source AI coding agent for DeepSeek.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wangcan26/dscode"><img src="docs/assets/badge-npm.svg" alt="npm version" /></a>
  <img src="docs/assets/badge-node.svg" alt="Node.js >=20" />
  <img src="docs/assets/badge-deepseek.svg" alt="DeepSeek native" />
</p>

<p align="center">
  面向数字工作的 DeepSeek 交互式 AI Agent Harness。支持 **终端 (TUI)** 和 **浏览器 (Web UI)** 两种交互方式。<br />
  从 Agentic Workflow 到上下文管理再到记忆系统，dscode 只做 DeepSeek 模型的 Harness。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@wangcan26/dscode">npm</a> ·
  <a href="docs/Introduction.md">设计理念</a> ·
  <a href="docs/">架构文档</a> ·
  <a href="docs/roadmap.md">Roadmap</a>
</p>

## Why dscode

<table>
<tr>
<td width="33%" valign="top">
  <strong>DeepSeek native</strong><br />
  围绕 DeepSeek 模型能力设计，不做多模型折中层，配置、推理模式和体验都为 DeepSeek 优化。
</td>
<td width="33%" valign="top">
  <strong>Agent harness</strong><br />
  文件操作、Shell、代码搜索、权限控制、上下文压缩、会话持久化和记忆系统一体化。
</td>
<td width="33%" valign="top">
  <strong>Digital work ready</strong><br />
  通过 MCP 把能力延伸到浏览器、3D、文档、表格和更多外部工具，而不只停留在代码生成。
</td>
</tr>
</table>

## Install in 30 seconds

<table>
<tr>
<td width="50%" valign="top">

### 使用 npm 安装

```bash
# Node.js >= 20
npm install -g @wangcan26/dscode
dscode --version
dscode
```


安装包：<https://www.npmjs.com/package/@wangcan26/dscode>

</td>
<td width="50%" valign="top">

### 本地构建运行

```bash
npm install
npm run build
node dist/dscode.mjs
```


适合本地开发、调试和二次修改。

</td>
</tr>
</table>

> 如果你喜欢这个项目，欢迎在 GitHub 点个 ⭐ Star、👀 Watch、👍 点赞支持！你的鼓励是我持续打磨 dscode 的动力，也非常感谢每一条反馈和建议。

### 首次启动

```bash
/config key sk-your-deepseek-api-key
/config model deepseek-v4-pro
```


`/config` 命令写入的配置会持久化到 `~/.dscode/config.json`，后续启动无需重复设置。
其中 `cwd` 会记录本次启动对应的项目目录；只有在你手动执行 `/config cwd <path>` 时，才会对当前项目复用该目录。
声明式配置单独放在 `settings.json`：用户级 `~/.dscode/settings.json`，项目级 `<project>/.dscode/settings.json`。

## Web UI

除了终端交互，dscode 也提供简洁现代的 **浏览器界面**，完整支持 TUI 的全部功能：

**npm 全局安装：**

```bash
dscode --web                  # 默认端口 3000
dscode --web --web-port 8080  # 自定义端口
```

**本地构建运行：**

```bash
npm run build:web             # 先构建前端
node dist/dscode.mjs --web    # 启动 Web 模式
```

浏览器打开 `http://localhost:3000` 即可使用：

<p align="center">
  <img src="docs/screen_shots/web-ui.gif" alt="DSCode Web UI" width="720" />
</p>

Web UI 包含：

| 功能 | 说明 |
| --- | --- |
| 流式对话 | 实时显示 thinking + 文本输出，与 TUI 体验一致 |
| 工具调用 | 内联卡片展示工具名、参数和结果（成功/失败图标） |
| 权限确认 | 图形化弹窗，Allow / Always Allow / Deny |
| Slash 命令 | 输入 `/` 弹出命令面板，支持键盘导航和点击 |
| 会话管理 | 侧边栏可视化浏览、保存、加载、删除会话 |
| MCP 浏览器 | 查看已连接 MCP 服务器和工具列表 |
| 配置管理 | 图形化切换模型、Thinking Level 和 API Key |
| 图片上传 | 支持拖拽 / 粘贴 / 点击上传图片 |
| 响应式布局 | 适配桌面和移动端 |
| 深色主题 | 默认 GitHub 风格暗色主题，保护眼睛 |

> Web UI 与 CLI 共享同一套 Agent 后端，所有功能完全一致。切换模式时无需重新配置。

## What you get

| 能力 | 说明 |
| --- | --- |
| 多轮对话 | 流式输出 + thinking（reasoning 模型） |
| 内置驱动 | fs、shell、search，始终可用 |
| 权限控制 | 危险操作需确认，支持 glob 模式禁止读写敏感文件 |
| 会话持久化 | 自动保存，可恢复历史对话 |
| 上下文管理 | 自动压缩长对话，防止 token overflow；1M token 窗口 |
| 记忆系统 | 跨 session 记住用户偏好和项目上下文 |
| Skills 系统 | 声明式第三方 Skill 扩展（SKILL.md），按需激活 |
| MCP 协议 | 作为 MCP Client 连接外部工具服务器（stdio / streamable-http / legacy SSE） |
| 图片 OCR | 基于 tesseract.js 的文字提取，支持中英文 |
| 两级配置 | 用户级 + 项目级配置，环境变量覆盖 |
| Web UI | 浏览器图形界面，实时流式对话，权限弹窗，侧边栏管理 |

## Digital work, not just coding

dscode 通过 **MCP (Model Context Protocol)** 连接外部工具，把 DeepSeek 的能力延伸到更广义的数字工作流——从 Blender 3D 建模到浏览器自动化，从文档与表格处理到设计与内容生产。

<table>
<tr>
<td width="50%"><img src="docs/screen_shots/blender_show.jpg" alt="Blender 展示" width="100%"></td>
<td width="50%"><img src="docs/screen_shots/blender_show1.jpg" alt="Blender MCP 演示" width="100%"></td>
</tr>
</table>

上图演示了通过 `blender-mcp` 连接 Blender，用自然语言操控 3D 场景。这类创意工具链只是数字工作的一种场景；dscode 通过标准 MCP 协议，让 DeepSeek 模型同样能接入更广泛的数字工具生态。

## Model configuration

在 TUI 中使用 `/config` 管理配置，无需编辑文件或设置环境变量：

```bash
/config                     # 查看当前配置
/config model <id>          # 切换模型（即时生效）
/config thinking <level>    # 设置思考强度
/config key <api-key>       # 设置 API Key
/config cwd <path>          # 为当前项目设置工作目录（重启生效）
/config help                # 查看帮助
```


默认使用 `deepseek-v4-flash`，推荐切换为 `deepseek-v4-pro` 获得更强的 reasoning / thinking 能力：

| 模型 | 特点 |
| --- | --- |
| `deepseek-v4-flash` | 默认，快速，适合日常编码 |
| `deepseek-v4-pro` | 支持 reasoning / thinking，复杂任务更强，支持图片 OCR |

> DeepSeek V4 系列均支持 **100 万 token** 上下文窗口，最大输出 384K token。

底层基于 `pi-ai`，可扩展接入 OpenAI、Anthropic、Google 等 25+ 提供商。

### Thinking levels

DeepSeek reasoning 模型通过 `thinkingLevel` 控制思考强度，切换模型时自动匹配默认值（pro → `medium`，其他 → `off`），也可手动覆盖：

| Level | 行为 |
| --- | --- |
| `off` | 关闭思考，直接输出 |
| `minimal` / `low` / `medium` / `high` | 启用思考，映射为 `reasoning_effort: "high"` |
| `xhigh` | 最大思考强度，映射为 `reasoning_effort: "max"` |

```bash
/config thinking xhigh
```


## MCP connector

| 能力 | 说明 |
| --- | --- |
| **Stdio 传输** | 启动本地进程作为 MCP Server，零网络开销 |
| **Streamable HTTP 传输** | 连接远程 MCP Server，优先使用 2025-11-25 MCP 主路径 |
| **Legacy SSE 兼容** | 远端不支持新传输时，可显式指定或自动回退到旧版 SSE |
| **自动 Transport 推断** | 有 `command` → stdio，仅 `url` → streamable-http，零配置 |
| **工具命名空间** | `mcp_<server>_<tool>` 格式，避免冲突 |
| **容错降级** | Server 连接失败不阻塞启动，错误信息可观测 |

### MCP 配置示例

将 MCP 写在 `~/.dscode/settings.json` 或 `<project>/.dscode/settings.json` 中，而不是 `/config` 写入的 `config.json`。

```jsonc
{
  "mcpServers": {
    "blender": {
      "description": "Blender 3D modeling via MCP",
      "command": "uvx",
      "args": ["blender-mcp"]
    },
    "playwright": {
      "description": "Browser automation",
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    },
    "custom-api": {
      "description": "Remote API server",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```


| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `command` | string | stdio 必填 | 启动命令 |
| `args` | string[] | 否 | 命令参数 |
| `url` | string | 远端传输必填 | 远程 MCP Server URL |
| `transport` | `"stdio" \| "streamable-http" \| "sse"` | 否 | 传输方式；未显式指定时，`url` 默认走 `streamable-http` |
| `description` | string | 否 | 描述信息 |
| `env` | object | 否 | 自定义环境变量 |
| `headers` | object | 否 | 远程 MCP 请求头 |
| `preferredProtocolVersion` | string | 否 | 首选 MCP 协议版本，默认 `2025-11-25` |
| `allowLegacySseFallback` | boolean | 否 | 远端不支持新传输时是否允许回退到 legacy SSE |
| `requestTimeoutMs` / `connectTimeoutMs` | number | 否 | 请求 / 连接超时 |

MCP 工具注册为 Driver，命名格式 `mcp_<server>_<tool>`，例如 `mcp_blender_get_scene_info`。连接失败不阻塞启动，错误信息输出到控制台。

可在 TUI 中输入 `/mcp` 打开交互式浏览器：先选择 MCP server，再查看该 server 的 tool 列表、加载状态，以及 transport / protocol version / compatibility mode / refresh 状态。

## Skills system

dscode 采用 **Agent as OS** 架构：Drivers（内核模块，始终加载）和 Skills（用户态程序，按需激活）。

```text
~/.dscode/skills/
├── git-workflow/
│   └── SKILL.md
└── docker/
    └── SKILL.md
```


**SKILL.md 格式：**

```yaml
---
name: git-workflow
description: Advanced git operations for PR workflows
tools:
  - read_file
  - list_files
  - grep
  - bash
---
## Instructions
When the user asks about git workflows, use these tools.
Always push the branch before creating a PR.
```


- YAML frontmatter 声明 `name`、`description`、`tools` 白名单
- 激活时 instructions 注入 system prompt，根据白名单从已加载 Driver 中筛选工具
- 启动时自动激活所有扫描到的 Skill，也支持 `/skills activate <name>` 手动激活

## CLI commands

| 命令 | 说明 |
| --- | --- |
| `/help` | 显示所有命令 |
| `/config` | 查看或修改用户命令配置（模型 / Key / 思考 / cwd） |
| `/reset` | 清空对话历史 |
| `/session list/save/load/delete` | 会话管理 |
| `/memory list/add/remove/clear` | 记忆管理 |
| `/skills` | 列出 Skills 及状态 |
| `/drivers` | 列出已加载的驱动 |
| `/mcp` | 交互式浏览 MCP server 与 tools |
| `/permissions` | 查看当前权限授予 |
| `/cost` | 显示 token 用量 |
| `/compact` | 手动压缩上下文 |

退出：输入 `exit` 或按 `Ctrl+C` 两次。中断生成：单次 `Ctrl+C`。Web UI 中命令对应侧边栏和按钮操作。

## Configuration reference

推荐把配置分成两类：

- `/config` 命令写入的用户命令配置：`~/.dscode/config.json`（包含当前项目的 cwd 记录）
- 声明式 settings：
  - 用户级：`~/.dscode/settings.json`
  - 项目级：`<project>/.dscode/settings.json`

项目级配置统一使用 `<project>/.dscode/settings.json`。

### `/config` command config

```jsonc
{
  "modelId": "deepseek-v4-flash",
  "thinkingLevel": "high",
  "cwd": "/absolute/path/to/project/subdir",
  "cwdProjectPath": "/absolute/path/to/project"
}
```


### `settings.json`

```jsonc
{
  "skills": ["git-workflow"],
  "permissions": {
    "deny": ["**/.env", "**/.env.*", "**/secrets/**"]
  },
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic/mcp-playwright"]
    }
  }
}
```


### Environment variables

| 环境变量 | 对应配置 |
| --- | --- |
| `DEEPSEEK_API_KEY` | API Key |
| `AGENT_MODEL` / `DEEPSEEK_MODEL` | modelId |
| `AGENT_THINKING_LEVEL` | thinkingLevel |
| `DSCODE_MAX_TOKENS` | maxTokens |
| `DSCODE_PROJECT_PATH` | 工作目录（默认当前目录） |
| `DSCODE_CONFIG_HOME` | 自定义配置目录（默认 `~/.dscode`） |
| `DSCODE_DATA_HOME` | 自定义数据目录（默认 `~/.dscode`） |

## Examples

`examples/` 提供可直接运行的示例项目，用来演示 dscode 的 MCP 集成方式和交互式 UI 能力。

### MCP App

| 示例 | 说明 | 快速开始 |
| --- | --- | --- |
| `examples/scenario-modeler` | 一个 SaaS 场景建模 MCP Server。演示 tool 返回 `structuredContent` / `isError` 后，dscode 如何渲染 MCP App；没有 server HTML 时走 MDX，有 HTML resource 时优先使用 server 自带页面。 | `cd examples/scenario-modeler && npm install && npm start` |

<p align="center">
  <img src="docs/screen_shots/mcp-app.gif" alt="MCP App 演示" width="720" />
</p>

> 上图演示了 scenario-modeler 在 Web UI 中内联展示 MCP App HTML —— 点击 "Open App ▼" 即可展开交互式 SaaS 财务建模仪表盘。

更多使用说明见：
- `examples/scenario-modeler/README.md`

## Project structure

```text
src/
├── core/           # 入口、host 组装、配置、共享类型
├── session/        # 会话持久化
├── context/        # token 估算、上下文压缩
├── memory/         # 跨 session 记忆
├── drivers/        # 驱动注册 + 内置驱动 (fs, shell, search)
├── skills/         # Skill 管理器 + SKILL.md 加载器
├── mcp/            # MCP 客户端（stdio / streamable-http / legacy SSE）+ 管理器 + MCP App host/runtime
├── permissions/    # 权限拦截
└── ui/             # TUI (终端)、Web UI (浏览器)、流式渲染、slash commands
```


## Permission model

| 工具 | 默认策略 |
| --- | --- |
| `read_file`, `list_files`, `grep`, `glob` | 自动放行 |
| `write_file` | 需确认 |
| `bash` | 需确认；`sudo`、`rm -rf` 等直接拒绝 |

确认时可选择：**Y**（放行本次）、**N**（拒绝）、**A**（本 session 始终放行该工具）。

通过 `permissions.deny` 配置 glob 模式阻止读写敏感文件，用户级和项目级的 deny 列表取并集。

## Development

```bash
npm start
npm run typecheck
npm test

**Web UI 开发：**

```bash
# 安装前端依赖
cd web && npm install && cd ..

# 构建前端 + 启动 Web 模式
npm run build:web
dscode --web

# 开发模式（前端 HMR + 后端热重载）
npm run dev:web
``````

**技术栈：** TypeScript + tsx · React + Vite + Tailwind CSS (Web UI) · [pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) · [pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) · DeepSeek API

欢迎贡献！请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解理念对齐和 PR 流程。

## Known limitations

- 上下文压缩的 `summarize-prefix` 策略当前回退为 `sliding-window`
- 记忆自动提取默认关闭，需手动 `/memory add`
- 图片输入基于 OCR，仅提取文字，不具备视觉理解能力
- 首次启动若无输出，通常为 API Key 无效或网络问题

## More docs

- [架构设计文档](docs/)
- [Roadmap](docs/roadmap.md)

## License

MIT
