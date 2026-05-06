# DSCode

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
| `/skills` | 列出技能及状态 |
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

## 数据目录

```
~/.dscode/
├── config.json           # 用户配置
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

## 已知限制

- 上下文压缩的 `summarize-prefix` 策略当前回退为 `sliding-window`（需额外 LLM 调用）
- 记忆自动提取（`autoExtract`）默认关闭，需手动 `/memory add`
- 首次启动若无输出，通常是 API Key 无效或网络问题

## License

MIT
