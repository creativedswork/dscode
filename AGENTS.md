# AGENTS.md

本文件描述项目的 Agent 架构，供 AI Agent（Claude Code、Cursor 等）快速理解代码结构与项目定位。

## 架构概述

基于 `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` 的分层 CLI Agent Harness。

采用 **Agent as OS** 设计理念：

```
UI (REPL + 渲染)
  ↓ 事件订阅
Permissions (beforeToolCall)
  ↓
Skills (用户态程序，按需激活)
  ↓
Drivers (内核模块，始终加载)
  ↓
Memory (system prompt 注入)
  ↓
Context (transformContext 压缩)
  ↓
Session (持久化)
  ↓
Agent Loop (pi-agent-core，已有)
```

- **Agent = Kernel** — 核心调度循环
- **Drivers = 内核模块** — 始终加载，与硬件/环境交互（fs, shell, search, mcp）
- **Skills = 用户态程序** — 按需激活，SKILL.md 声明式定义

## 模块清单

| 目录 | 职责 | 关键文件 |
|------|------|----------|
| `src/core/` | 入口、host 组装、配置、共享类型 | `main.ts`, `harness.ts`, `config.ts`, `types.ts` |
| `src/session/` | 会话持久化（JSON + atomic write） | `manager.ts`, `store.ts` |
| `src/context/` | token 估算、上下文压缩 | `manager.ts`, `estimator.ts`, `compaction.ts` |
| `src/memory/` | 跨 session 记忆（XDG data dir） | `manager.ts`, `store.ts` |
| `src/drivers/` | 驱动注册 + 内置 3 个驱动 | `registry.ts`, `fs.ts`, `shell.ts`, `search.ts` |
| `src/skills/` | Skill 管理器 + SKILL.md 加载器 | `manager.ts`, `loader.ts` |
| `src/mcp/` | MCP 客户端（stdio/SSE）+ 管理器 | `client.ts`, `manager.ts`, `types.ts` |
| `src/permissions/` | 权限拦截（deny/ask/allow） | `manager.ts`, `rules.ts` |
| `src/ui/` | REPL、流式渲染、slash commands | `tui-app.ts`, `conversation.ts`, `commands.ts` |

## 内置驱动 (Drivers)

| 驱动名 | 来源 | 工具 | 权限 |
|--------|------|------|------|
| `fs` | builtin | `read_file`, `write_file`, `list_files` | always-allow (read/list), ask (write) |
| `shell` | builtin | `bash` | ask (deny dangerous patterns) |
| `search` | builtin | `grep`, `glob` | always-allow |

MCP 服务器连接后也会注册为驱动，source 为 `"mcp"`。

## 关键 Hook 接线

```typescript
new Agent({
  streamFn: streamSimple,                    // pi-ai 统一流式
  transformContext: contextManager.transform, // 上下文压缩
  beforeToolCall: permissionManager.check,   // 权限拦截
});
```

## 数据位置

- 命令配置: `~/.dscode/config.json`（`/config` 写入）
- 声明式 settings: `~/.dscode/settings.json`（用户级） + `<project>/.dscode/settings.json`（项目级）
- 数据: `~/.dscode/data/`
  - `sessions/` — 会话历史
  - `memory/` — 全局 + 项目记忆

## 编码规范

- TypeScript strict，无 linter
- Google TypeScript Style 子集：2 spaces, semicolons, named exports, camelCase
- 文件 ≤300 行，一个文件一个职责
- 不写注释除非解释 WHY
- 详见 `docs/coding-style.md`

## 运行

```bash
npm start          # 本地开发：启动交互式 REPL
npm run typecheck  # 类型检查
npm test           # 运行测试
```

全局安装后直接使用 `dscode` 命令：

```bash
npm install -g dscode
dscode              # 启动交互式 REPL
```

首次启动若无 API Key，TUI 会显示欢迎引导，使用 `/config key <key>` 和 `/config model <id>` 完成配置。

## 测试方式

1. `npm run typecheck` — 零错误
2. `npm start` — 启动后输入消息测试 LLM 对话
3. 输入 `/help` 验证 slash commands
4. 输入 `/config` 验证配置管理
5. 让 agent 调用工具（如 "列出当前目录文件"）验证工具链路
