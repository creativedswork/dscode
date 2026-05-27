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
| `web/` | Web 前端（独立 Vite + React 项目） | `src/components/`, `src/hooks/`, `src/types/` |

## 内置驱动 (Drivers)

| 驱动名 | 来源 | 工具 | 权限 |
|--------|------|------|------|
| `fs` | builtin | `read_file`, `write_file`, `list_files` | always-allow (read/list), ask (write) |
| `shell` | builtin | `bash` | ask (deny dangerous patterns) |
| `search` | builtin | `grep`, `glob` | always-allow |
| `edit` | builtin | `edit` | ask (same as write_file) |

MCP 服务器连接后也会注册为驱动，source 为 `"mcp"`。

## LSP MCP — 代码上下文感知

本项目通过 `.dscode/settings.json` 配置了 LSP MCP 服务器（TypeScript Language Server），提供对仓库的深度代码智能感知。

### 优先使用 LSP 工具

对代码进行理解、导航、重构时，**优先使用 LSP MCP 工具**而非裸 `grep` / `read_file`：

| 场景 | 优先 LSP 工具 | 不推荐 |
|------|-------------|--------|
| 查找定义 | `mcp_lsp_textDocument_definition` | grep 符号名 |
| 查找引用 | `mcp_lsp_textDocument_references` | grep 全仓库 |
| 类型信息 | `mcp_lsp_textDocument_hover` | read_file 逐行读 |
| 符号浏览 | `mcp_lsp_textDocument_documentSymbol` | grep class/function |
| 全局符号搜索 | `mcp_lsp_workspace_symbol` | grep -r |
| 查找实现 | `mcp_lsp_textDocument_implementation` | grep + 人肉推断 |
| 类型定义 | `mcp_lsp_textDocument_typeDefinition` | grep interface/type |
| 代码补全 | `mcp_lsp_textDocument_completion` | — |
| 格式化 | `mcp_lsp_textDocument_formatting` | — |
| 重命名 | `mcp_lsp_textDocument_rename` | sed 批量替换 |
| 诊断/代码操作 | `mcp_lsp_textDocument_codeAction` | — |

### 使用方式

LSP 工具通过 `search_tools` 发现后按需加载（deferred）。工具名前缀为 `mcp_lsp_`，使用 `search_tools` 查询 `lsp` 即可获取完整列表。

工具以文件路径为参数，直接传入绝对路径即可，无需先转 URI。

`web/` 放在根目录而非 `src/` 下，因为它是独立的 Vite + React 项目，有自己的 `tsconfig.json`、`package.json`、`vite.config.ts`，不和 `src/` 共用 tsc 构建。构建产物输出到 `dist/web/`，由 dscode 的 HTTP server 直接 serve。

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
npm start -- --web  # Web 模式：浏览器中对话
npm run build:web   # 构建前端（npm start 前需先执行）
npm run typecheck  # 类型检查
npm run ci:check   # 模拟 CI 干净构建（删 node_modules 重装 + 全量 build）
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
