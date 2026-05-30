# AGENTS.md

本文件描述项目的 Agent 架构，供 AI Agent（Claude Code、Cursor 等）快速理解代码结构与项目定位。

## LSP MCP — 代码上下文感知

本项目通过 `.dscode/settings.json` 配置了 LSP MCP 服务器（TypeScript Language Server），提供对仓库的深度代码智能感知。

### 规则

> **对代码进行理解、导航、重构时，禁止跳过 LSP 工具直接用 grep/read_file。**
> LSP 工具是 deferred 的，需要先 `search_tools` 加载才能使用。多这一步开销，但结果远比 grep 精确（不会匹配注释、字符串、同名变量）。

**触发词 → 工具映射**（以下任一触发词出现，必须走 LSP）：

| 用户意图 | 必须使用的 LSP 工具 | 禁止使用 |
|----------|-------------------|----------|
| "调用链"、"谁调用了"、"在哪些地方使用"、"查找引用" | `references` | grep |
| "定义"、"在哪定义的"、"跳转"、"查看源码" | `definition` | grep + read_file |
| "类型"、"接口"、"这是什么类型" | `hover` / `typeDefinition` | read_file 逐行读 |
| "符号"、"有哪些方法"、"文件结构" | `documentSymbol` | grep class/function |
| "实现"、"谁实现了" | `implementation` | grep + 人肉推断 |
| "重命名"、"改名字" | `rename` | sed 批量替换 |
| 全局搜索符号 | `workspace_symbol` | grep -r |

其他场景（补全、格式化、代码操作）按需使用。

### 工作流

1. 先 `search_tools` 查询 `lsp` 加载所需工具
2. 调用 LSP 工具，传入文件绝对路径
3. 仅在 LSP 工具不适用时（如搜索非代码文本）回退到 grep/read_file

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
- 详见 `docs/STYLE.md`

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

## 图像 / 视觉识别能力

本项目支持通过以下两种途径识别图片内容，**当用户要求"识别图片"、"看图片"、"分析截图"等时，你必须直接利用这些能力，而不应该拒绝**：

1. **Vision 模型代理** — 如果当前主模型不支持图片输入（如 DeepSeek Chat / GPT-4 等纯文本模型），系统会将请求路由到配置的 vision 模型（如 GPT-4o / Claude 3.5 Sonnet / Gemini 2.0 Flash 等支持图片输入的模型）。你需要：
   - 识别用户意图中是否包含图片或截图
   - 调用 vision 模型的接口来完成图片理解
   - 将结果返回给用户，无需让用户知道背后路由过程

2. **OCR 替代方案** — 当 vision 模型不可用或需要更精确的文本提取时，可以使用工具（如 `bash` 调用 tesseract、python 的 pytesseract、或通过 MCP 的 OCR 工具）直接识别图片中的文字。适合截图中的代码、文档、表单等场景。

3. **混合模式** — 对于复杂场景（如 UI 截图），可以先用 OCR 提取文字，再发给 vision 模型做整体语义理解，最后综合两类结果。

**注意事项**：
- 如果用户消息中带了图片 URL 或 base64 编码的图片数据，**不要以"我是文本模型无法识别图片"为由拒绝**，应该直接使用上述能力处理
- 图片可以来自本地文件路径（通过 `read_file` 读取）、URL、或用户粘贴的 base64 数据

## 测试方式

1. `npm run typecheck` — 零错误
2. `npm start` — 启动后输入消息测试 LLM 对话
3. 输入 `/help` 验证 slash commands
4. 输入 `/config` 验证配置管理
5. 让 agent 调用工具（如 "列出当前目录文件"）验证工具链路
