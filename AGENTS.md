# AGENTS.md

本文件描述项目的 Agent 架构，供 AI 编程助手（Claude Code、Cursor 等）快速理解代码结构。

## 架构概述

基于 `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` 的分层 CLI Agent Harness。

```
UI (REPL + 渲染)
  ↓ 事件订阅
Permissions (beforeToolCall)
  ↓
Skills (工具注册)
  ↓
Memory (system prompt 注入)
  ↓
Context (transformContext 压缩)
  ↓
Session (持久化)
  ↓
Agent Loop (pi-agent-core，已有)
```

## 模块清单

| 目录 | 职责 | 关键文件 |
|------|------|----------|
| `src/core/` | 入口、host 组装、配置、共享类型 | `main.ts`, `harness.ts`, `config.ts`, `types.ts` |
| `src/session/` | 会话持久化（JSON + atomic write） | `manager.ts`, `store.ts` |
| `src/context/` | token 估算、上下文压缩 | `manager.ts`, `estimator.ts`, `compaction.ts` |
| `src/memory/` | 跨 session 记忆（XDG data dir） | `manager.ts`, `store.ts` |
| `src/skills/` | 工具注册 + 内置 6 个工具 | `registry.ts`, `fs.ts`, `shell.ts`, `search.ts` |
| `src/permissions/` | 权限拦截（deny/ask/allow） | `manager.ts`, `rules.ts` |
| `src/ui/` | REPL、流式渲染、slash commands | `repl.ts`, `render.ts`, `commands.ts` |

## 内置工具

| 工具名 | 来源 | 权限 |
|--------|------|------|
| `read_file` | skills/fs.ts | always-allow |
| `write_file` | skills/fs.ts | ask |
| `list_files` | skills/fs.ts | always-allow |
| `bash` | skills/shell.ts | ask (deny dangerous patterns) |
| `grep` | skills/search.ts | always-allow |
| `glob` | skills/search.ts | always-allow |

## 关键 Hook 接线

```typescript
new Agent({
  streamFn: streamSimple,                    // pi-ai 统一流式
  transformContext: contextManager.transform, // 上下文压缩
  beforeToolCall: permissionManager.check,   // 权限拦截
});
```

## 数据位置

- 配置: `$XDG_CONFIG_HOME/agent/config.json` (默认 `~/.config/agent/`)
- 数据: `$XDG_DATA_HOME/agent/` (默认 `~/.local/share/agent/`)
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
npm start          # 启动交互式 REPL
npm run typecheck  # 类型检查
```

## 测试方式

目前无自动化测试。验证方法：
1. `npm run typecheck` — 零错误
2. `npm start` — 启动后输入消息测试 LLM 对话
3. 输入 `/help` 验证 slash commands
4. 让 agent 调用工具（如 "列出当前目录文件"）验证工具链路
