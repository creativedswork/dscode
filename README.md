# DSCode
> 从Angentic Workflow到上下文管理再到记忆系统，模型每强一分，Harness的重心就移一寸。目前阶段，远没有成熟稳定的Harness，也没有适配所有模型的万能Agent。DScode只想做DeepSeek模型的Harness，就像Claude Code是Claude模型的Harness一样。

基于 DeepSeek 模型的交互式命令行 Coding Agent，对标 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)。

具备文件操作、Shell 执行、代码搜索、权限控制、会话持久化、上下文管理和记忆系统，让 DeepSeek 成为你终端里的编程搭档。

## 快速开始

### 前置条件

- Node.js ≥ 20.6
- DeepSeek API Key: <https://platform.deepseek.com/>

### 安装

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
```

### 运行

```bash
npm start
```

看到 `you ›` 提示即可开始对话：

```
DSCode  (deepseek-v4-flash)
Type a message. /help for commands. exit to quit.

you › 列出 src 目录结构
[tool] list_files src/ recursive=true
agent › 当前 src/ 目录包含 7 个模块：core, session, context, memory, skills, permissions, ui
```

## 核心功能

| 功能 | 说明 |
|------|------|
| 多轮对话 | 流式输出 + thinking（reasoning 模型） |
| 内置工具 | read_file, write_file, list_files, bash, grep, glob |
| 权限控制 | 危险操作需确认，可选 always allow；支持 glob 模式禁止读写敏感文件 |
| 会话持久化 | 自动保存，可恢复历史对话 |
| 上下文管理 | 自动压缩长对话，防止 token overflow；截断自动续写 |
| 记忆系统 | 跨 session 记住用户偏好和项目上下文 |
| Skills 系统 | 内置工具始终可用 + 声明式第三方 Skill 扩展（SKILL.md） |
| MCP 协议支持 | 作为 MCP client 连接外部工具服务器（stdio/SSE），动态扩展能力 |
| 等待指示器 | 模型响应空闲 >1s 时显示动画及分段计时统计 |
| 两级配置 | 用户级 + 项目级配置，灵活覆盖 |
| Slash 命令 | /help, /reset, /session, /memory, /skills 等 |

## 模型配置

默认使用 `deepseek-v4-flash`。通过环境变量切换：

```bash
DEEPSEEK_MODEL=deepseek-v4-pro npm start
```

| 模型 | 特点 |
|------|------|
| `deepseek-v4-flash` | 默认，快速，适合日常编码和工具调用 |
| `deepseek-v4-pro` | 支持 reasoning/thinking，复杂任务更强 |

底层基于 `pi-ai`，可扩展接入 OpenAI、Anthropic、Google 等 25+ 提供商。

## 命令参考

| 命令 | 说明 |
|------|------|
| `/help` | 显示所有命令 |
| `/reset` | 清空对话历史 |
| `/session list` | 列出已保存会话 |
| `/session save` | 手动保存当前会话 |
| `/session load <id>` | 恢复历史会话 |
| `/memory list` | 查看记忆 |
| `/memory add <内容>` | 手动添加记忆 |
| `/skills` | 列出技能及状态（内置 + 外部） |
| `/skills activate <name>` | 激活外部技能 |
| `/skills deactivate <name>` | 停用外部技能 |
| `/permissions` | 查看当前权限授予 |
| `/cost` | 显示 token 用量 |
| `/compact` | 手动压缩上下文 |

退出：输入 `exit` 或按 `Ctrl+C` 两次。中断生成：单次 `Ctrl+C`。

## 配置

支持两级配置，项目级覆盖用户级：

- 用户级：`~/.dscode/config.json`
- 项目级：`<project>/.dscode/config.json`

优先级：**环境变量 > 项目级 config.json > 用户级 config.json > 默认值**

```jsonc
{
  "provider": "deepseek",   // LLM 提供商（默认 "deepseek"）
  "modelId": "deepseek-v4-flash",  // 模型 ID（默认 "deepseek-v4-flash"）
  "maxTokens": 16384,  // 模型最大输出 token 数（默认 16384）
  "skills": ["git-workflow"],  // 启动时自动激活的外部 skill
  "permissions": {
    "deny": ["**/.env", "**/.env.*", "**/secrets/**"]
  }
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `provider` | string | `"deepseek"` | LLM 提供商，可选 deepseek / openai / anthropic 等 |
| `modelId` | string | `"deepseek-v4-flash"` | 模型 ID |
| `maxTokens` | number | `16384` | 模型单次输出最大 token 数 |
| `skills` | string[] | `[]` | 启动时自动激活的外部 skill 名称列表（两级取并集） |
| `permissions.deny` | string[] | `[]` | 禁止读写的文件 glob 模式（两级配置取并集） |

| 环境变量 | 对应配置 |
|----------|----------|
| `AGENT_PROVIDER` | provider |
| `AGENT_MODEL` / `DEEPSEEK_MODEL` | modelId |
| `DSCODE_MAX_TOKENS` | maxTokens（最大输出 token 数） |
| `DSCODE_PROJECT_PATH` | 工作目录（默认为当前目录） |
| `DSCODE_CONFIG_HOME` | 自定义配置目录（默认 `~/.dscode`） |
| `DSCODE_DATA_HOME` | 自定义数据目录（默认 `~/.dscode`） |

### 指定工作目录

默认使用启动时的当前目录作为项目工作目录。通过 `DSCODE_PROJECT_PATH` 可指定不同的目录：

```bash
DSCODE_PROJECT_PATH=/path/to/project npm start
```

### 文件权限

通过 `permissions.deny` 配置 glob 模式来阻止 agent 读写特定文件：

```jsonc
// 项目级 .dscode/config.json
{
  "permissions": {
    "deny": ["**/.env", "**/.env.*", "**/secrets/**"]
  }
}
```

支持的 glob 语法：`*`（匹配单级路径中的任意字符）、`**`（匹配任意层路径）。
用户级和项目级的 deny 列表会合并（取并集），任一级别配置的模式都会生效。

## Skills 系统

DSCode 的工具分为**内置工具**和**外部 Skill**两层：

- **内置工具**（filesystem, bash, search）始终可用，不可停用
- **外部 Skill** 通过 `SKILL.md` 声明式定义，支持渐进式加载

### 目录结构

```
~/.dscode/skills/               # 用户级 Skills
├── git-workflow/
│   └── SKILL.md
└── docker/
    └── SKILL.md

<project>/.dscode/skills/       # 项目级 Skills（近优先，同名覆盖用户级）
└── deploy/
    └── SKILL.md
```

### SKILL.md 格式

```yaml
---
name: git-workflow
description: Advanced git operations for PR workflows
tools:
  - name: create_pr
    description: Create a pull request on GitHub
    parameters:
      title: { type: string, description: "PR title" }
      body: { type: string, description: "PR body" }
    command: gh pr create --title {{title}} --body {{body}}
---

## Instructions

When the user asks about git workflows, use these tools.
Always push the branch before creating a PR.
```

- `---` 之间为 YAML frontmatter，声明 name、description、tools
- `---` 之后为自由 markdown，激活时作为使用指南注入 system prompt
- `command` 中 `{{param}}` 会自动替换并做 shell escape（防注入）
- 参数 type 支持：`string`, `number`, `boolean`

### 激活方式

1. **配置自动激活**：在 config.json 中 `"skills": ["git-workflow"]`
2. **用户手动激活**：`/skills activate <name>`
3. **模型自主激活**：模型判断需要时自动调用 `activate_skill` 工具

### 渐进式加载

启动时只读取各 SKILL.md 的 name + description 作为索引，system prompt 中仅放一行摘要。
激活时才解析完整 tools 定义并注入 agent，最小化 context 开销。

## MCP 配置

DSCode 支持通过 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 连接外部工具服务器，动态扩展 agent 能力。MCP server 通过配置文件声明，支持 stdio 和 SSE 两种传输方式。

### 配置方式

在项目级或用户级 `config.json` 中添加 `mcp.servers` 数组：

```jsonc
{
  "mcp": {
    "servers": [
      {
        "name": "playwright",
        "description": "Browser automation via Playwright",
        "transport": "stdio",
        "command": "npx",
        "args": ["@anthropic/mcp-playwright"]
      },
      {
        "name": "custom-api",
        "description": "Custom API server",
        "transport": "sse",
        "url": "http://localhost:3000/mcp"
      }
    ]
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Server 唯一标识 |
| `description` | string | 否 | 描述信息 |
| `transport` | "stdio" \| "sse" | 是 | 传输方式 |
| `command` | string | stdio 必填 | 启动命令 |
| `args` | string[] | 否 | 命令参数 |
| `url` | string | SSE 必填 | SSE 服务端 URL |
| `env` | object | 否 | 自定义环境变量 |

### 工具命名

MCP 工具注册为 Skill，命名格式为 `mcp_<server>_<tool>`，避免命名冲突。例如 `mcp_playwright_browser_navigate`。

### 错误处理

- MCP server 连接失败不会阻止启动，错误信息会打印到控制台
- 连接失败时显示详细的 stderr 输出（如 npm 404 错误）
- 工具调用失败时返回错误信息，不会影响其他工具

## 数据目录

```
~/.dscode/
├── config.json           # 用户配置
├── skills/               # 用户级第三方 Skills
│   └── <skill-name>/
│       └── SKILL.md
└── data/
    ├── sessions/         # 会话历史
    └── memory/           # 记忆（全局 + 项目级）
```

## 项目结构

```
src/
├── core/           # 入口、host 组装、配置、共享类型
├── session/        # 会话持久化 (JSON, atomic write)
├── context/        # token 估算、上下文压缩
├── memory/         # 跨 session 记忆
├── skills/         # 工具注册 + 内置工具 (fs, shell, search)
├── permissions/    # 权限拦截 (beforeToolCall hook)
└── ui/             # REPL、流式渲染、slash commands
```

## 权限模型

| 工具 | 默认策略 |
|------|----------|
| read_file, list_files, grep, glob | 自动放行 |
| write_file | 需确认 |
| bash | 需确认；`sudo`, `rm -rf` 等直接拒绝 |

确认时可选择：
- **Y** — 本次放行
- **N** — 拒绝
- **A** — 本 session 始终放行该工具

## 开发

```bash
npm start            # 启动 Agent REPL
npm run typecheck    # TypeScript 类型检查
```

## 技术栈

- TypeScript + [tsx](https://github.com/privatenumber/tsx)
- [@mariozechner/pi-agent-core](https://www.npmjs.com/package/@mariozechner/pi-agent-core) — Agent 循环框架
- [@mariozechner/pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) — 多模型接入层
- DeepSeek API

> 本着不重复造轮子的原则，本项目基于pi-ai 以及 pi-agent-core 实现Agent Runtime. 虽然借助Claude Code完全实现了基于该Runtime的Coding CLI能力，但我也意识到，Harness是一个前沿的领域，需要匠心不断探索，为DeepSeek模型打造最好的Harness。

## Roadmap
### P0 — 核心能力

- [ ] **Diff-based 编辑工具** — 支持 patch/diff 级别的文件修改，替代全文覆写
- [ ] **项目指令文件（DSCODE.md）** — 自动加载项目根目录的指令到 system prompt，无需手动 /memory add
- [ ] **Sub-agent 子代理** — 支持并行派生子 agent 处理复杂子任务
- [ ] **自动记忆提取** — 实现 `autoExtract`，从对话中自动提取偏好和经验
- [ ] **System prompt 自进化** — 根据用户反馈和任务结果动态调整 system prompt

### P1 — 开发者体验

- [ ] **Git 感知** — 自动检测 git 状态、分支信息注入上下文；结构化 git 工具（commit、diff、PR）
- [x] **MCP 协议支持** — 作为 MCP client 连接外部工具服务器，动态扩展能力
- [ ] **外部 Hooks 系统** — 支持在 config 中配置 before/after tool call 的外部脚本
- [ ] **Plan 模式** — 复杂任务先生成计划并经用户确认后再执行
- [ ] **任务追踪** — 内置 task list，支持多步骤进度跟踪和依赖管理

### P2 — 自进化机制

- [ ] **Session 分析** — 结构化记录每次会话的工具调用、成功率、耗时，用于后续进化决策
- [ ] **输出质量自评估** — 任务完成后自动评估输出质量，反馈到记忆系统
- [ ] **技能自生成** — 识别能力缺口，自动生成新 skill 定义并注册
- [ ] **Prompt 变异引擎** — prompt 版本管理、A/B 测试、效果度量、自动择优
- [ ] **Meta-agent 监督层** — 监督主 agent 执行，识别失败模式并提出改进

### P3 — 扩展功能

- [ ] **Web 搜索/抓取** — 内置 web search 和 URL fetch 工具
- [ ] **图片/PDF 读取** — 多模态输入支持
- [ ] **通知系统** — 长任务完成后桌面通知
- [ ] **定时任务** — 支持 cron 式定时执行
- [ ] **IDE 集成** — VS Code / JetBrains 扩展
- [ ] **实际 token 用量追踪** — 从 API 响应中读取真实 usage，计算成本
- [x] **外部 Skill 加载** — 支持从 `~/.dscode/skills/` 和项目级目录动态加载声明式技能（SKILL.md）

## 已知限制

- 上下文压缩的 `summarize-prefix` 策略当前回退为 `sliding-window`（需额外 LLM 调用）
- 记忆自动提取（`autoExtract`）默认关闭，需手动 `/memory add`
- 首次启动若无输出，通常是 API Key 无效或网络问题

## License

MIT
