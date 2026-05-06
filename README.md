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
| 权限控制 | 危险操作需确认，可选 always allow |
| 会话持久化 | 自动保存，可恢复历史对话 |
| 上下文管理 | 自动压缩长对话，防止 token overflow |
| 记忆系统 | 跨 session 记住用户偏好和项目上下文 |
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

## 项目结构

```
src/
├── core/           # 入口、host 组装、配置、共享类型
├── session/        # 会话持久化 (JSON, atomic write)
├── context/        # token 估算、上下文压缩
├── memory/         # 跨 session 记忆 (XDG data dir)
├── skills/         # 工具注册 + 内置工具 (fs, shell, search)
├── permissions/    # 权限拦截 (beforeToolCall hook)
└── ui/             # REPL、流式渲染、slash commands
```

数据目录（XDG 规范）：

```
~/.config/dscode/         # 用户配置
~/.local/share/dscode/
├── sessions/             # 会话历史
└── memory/               # 记忆（全局 + 项目级）
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

## 架构文档

详见 `docs/` 目录：

- [架构总览](docs/architecture-overview.md)
- [Layer 0: Agent Loop](docs/layer0-agent-loop.md)
- [Layer 1: Session](docs/layer1-session.md)
- [Layer 2: Context](docs/layer2-context.md)
- [Layer 3: Memory](docs/layer3-memory.md)
- [Layer 4: Skills](docs/layer4-skills.md)
- [Layer 5: Permissions](docs/layer5-permissions.md)
- [Layer 6: UI](docs/layer6-ui.md)
- [Harness (Host)](docs/harness.md)
- [编码规范](docs/coding-style.md)
- [设计决策](docs/design-decisions.md)

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
