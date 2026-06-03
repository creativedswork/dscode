# Architecture

dscode 是一个基于 `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` 构建的分层 CLI Agent Harness。

## 设计哲学

**Agent as OS** — Karpathy 的 LLM as OS 概念中，Agent 各组件在 OS 里都有映射：

| Agent 概念 | OS 映射 |
|-----------|--------|
| 上下文窗口 | 寄存器 |
| System Prompt | 内核 |
| 工具（Drivers） | 设备驱动接口 |
| MCP Server | USB 外部设备 |
| Skill | 用户态程序（SKILL.md = 文件描述符） |
| Sub Agent | 进程 |

dscode 不服务传统"代码感知"场景（那是 Cursor / Claude Code 的领地），而是面向**数字创作**——通过 MCP 连接 Blender、浏览器、文档、表格等创作工具，让模型探索和操控各类数字环境。

## 分层架构

每层只依赖内侧的层，禁止反向依赖。

```
┌──────────────────────────────────────────────────────────┐
│  Layer 6: UI        TUI (TuiBackend) + Web (WebBackend)  │
├──────────────────────────────────────────────────────────┤
│  Layer 5: Permissions   beforeToolCall 拦截 + 规则引擎     │
├──────────────────────────────────────────────────────────┤
│  Layer 4: Skills         用户态程序，SKILL.md 声明式加载    │
│           Drivers        内核模块 (fs/shell/search/edit/    │
│                           vision/discovery)                  │
│           Tool Search    延迟工具发现 (search_tools)         │
│           Checkpoint     编辑安全网 (save/commit/rollback)   │
├──────────────────────────────────────────────────────────┤
│  Layer 3: Memory         跨 session 记忆 + system prompt 注入│
├──────────────────────────────────────────────────────────┤
│  Layer 2: Context        token 估算 + 压缩 + overflow 恢复 │
├──────────────────────────────────────────────────────────┤
│  Layer 1: Session        会话持久化 + 恢复                  │
├──────────────────────────────────────────────────────────┤
│  Layer 0: Agent Loop     pi-agent-core + pi-ai（已有）     │
└──────────────────────────────────────────────────────────┘
```

---

## Layer 0: Agent Loop

由 `@mariozechner/pi-agent-core` 提供，dscode 不重复实现。

### Agent 核心 API

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt, model, tools, thinkingLevel
  },
  streamFn: streamSimple,
  transformContext: (msgs, signal) => contextManager.transform(msgs, signal),  // Layer 2
  beforeToolCall: (ctx, signal) => permissionManager.check(ctx, signal),       // Layer 5
  afterToolCall: (ctx, signal) => ...,                                         // 校准 + 日志
  sessionId: string,   // 用于 DeepSeek prompt cache 亲和
});
```

### 事件流

```
agent.prompt(input)
  → turn_start → message_start → [thinking/text/tool_call 流式 delta]
  → message_end → [tool_execution_start → tool_execution_end × N]
  → turn_end → (循环直到无 tool_call) → agent_end
```

### 事件类型

| 事件 | 用途 |
|------|------|
| `agent_start` / `agent_end` | Session 自动保存、记忆提取 |
| `turn_start` / `turn_end` | 统计追踪 |
| `message_start` / `message_update` / `message_end` | UI 渲染、token 校准 |
| `tool_execution_start` / `tool_execution_end` | 权限拦截、审计日志 |

---

## Layer 1: Session

### 职责

将对话状态（消息历史 + 元数据 + compactedPrefix）持久化到磁盘，支持恢复。

### 数据模型

```
~/.dscode/data/sessions/
├── index.json           # SessionMetadata[] 索引
├── <ulid>.json          # 单个 session 完整数据
└── ...
```

- **ID**: ULID（时间可排序，26 字符）
- **写入**: 原子写入（tmp → rename）
- **标题**: 首条用户消息截 60 字符

### SessionManager

- `createSession(model)` — 新建 session
- `saveSession(agent, metadata)` — 从 `agent.state.messages` 序列化并写入
- `loadSession(id, agent)` — 恢复 `agent.state.messages`
- `listSessions()` / `deleteSession(id)` — 管理操作
- `getCurrentSessionId()` — 返回 ULID 用于 prompt cache 亲和

---

## Layer 2: Context

### 职责

通过 `transformContext` hook，在每次 LLM 调用前确保消息不超上下文窗口。

### Token 估算

无本地 tokenizer，使用启发式算法：

- 英文/代码: `chars ÷ 3.5`
- CJK: `chars ÷ 2.5`
- 混合文本按比例加权
- 每次 LLM 返回 `usage.input` 后自动校准，精度逐渐收敛

### 压缩策略

| 策略 | 行为 | 适用场景 |
|------|------|----------|
| `drop-oldest` | 从头丢弃 user+assistant 对 | 简单快速 |
| `sliding-window` | 保留最近 K 轮 | 近期上下文优先 |
| `summarize-prefix` | 用 LLM 摘要前部消息，替换为合成消息 | 长对话保上下文 |

### Overflow 恢复

当 `isContextOverflow()` 返回 true → 强制激进压缩 → `agent.continue()` 重试。

### ContextManager

- `transform(messages, signal)` → 估算 → 判断 → 压缩
- `getTokenBudget(model, systemPrompt, tools)` → 计算可用预算
- 压缩后的 `compactedPrefix` 存入 Session，恢复时注入

---

## Layer 3: Memory

### 职责

跨 session 持久化知识（用户偏好、项目上下文），session 结束自动提取，session 开始注入 system prompt。

### 数据模型

```
~/.dscode/data/memory/
├── global.json              # 全局记忆
└── projects/
    └── <sha256-12>.json     # 项目级记忆（路径 hash 隔离）
```

### MemoryEntry

```typescript
{ id: ULID, scope: "global" | "project",
  category: "preference" | "fact" | "instruction",
  content: string, source: { sessionId, timestamp } }
```

### MemoryManager

- `getRelevantMemories()` → 格式化为 `## Memories` 注入 system prompt
- `extractAndStore(messages, sessionId)` → session 结束时 LLM 提取
- `addMemory()` / `removeMemory()` / `clearMemories()` — 手动管理
- 去重：新增前全文搜索相似条目（编辑距离 > 0.8 则更新而非新增）

---

## Layer 4: Drivers, Skills & Tool Search

### Driver（内核模块，始终加载）

Driver 是工具提供者，分为 builtin 和 MCP 两类：

| 驱动 | 来源 | 工具 |
|------|------|------|
| `fs` | builtin | `read_file`, `write_file`, `overwrite_file`, `list_files` |
| `shell` | builtin | `bash` |
| `search` | builtin | `grep`, `glob` |
| `edit` | builtin | `edit`（基于 hash anchor 的文件编辑） |
| `vision` | builtin | `ImagePipeline`（vision → OCR → fallback 图像处理链） |
| `discovery` | builtin | `search_tools`（延迟工具发现） |
| `<mcp-server>` | mcp | MCP Server 提供的工具，命名空间: `mcp_<server>_<tool>` |

`DriverRegistry` 管理所有驱动。builtin 驱动始终激活，MCP 驱动由 `MCPManager` 动态注册。

### Skill（用户态程序，按需激活）

Skill 通过 SKILL.md 声明式定义，从两个目录扫描加载：

- 用户级: `~/.dscode/skills/<name>/SKILL.md`
- 项目级: `<project>/.dscode/skills/<name>/SKILL.md`

Skill 不直接提供工具，而是声明**允许使用的 Driver 工具白名单**和**注入 system prompt 的 instructions**。激活后，`SkillManager` 将 instructions 追加到 system prompt，并限制该 skill 的工具访问范围。

### Tool Search（延迟工具发现）

当 MCP Server 提供的工具过多时，将所有工具 schema 塞进 context 会导致 token 浪费。Tool Search 解决此问题：

1. `ToolRegistry` 包装 `DriverRegistry`，标记 MCP 工具为 `deferred`
2. builtin 工具始终发送给 LLM；deferred 工具仅发送名称列表（不发送 schema）
3. LLM 需要时调用 `search_tools` 工具按关键词或 `select:` 精确匹配
4. 匹配到的工具被标记为 `discovered`，下一轮请求中携带完整 schema

### Vision Driver（图像处理管道）

Vision 驱动（`src/drivers/vision/`）提供统一的 `ImagePipeline`，负责图像预处理链：vision 模型描述 → OCR 降级 → 文本占位符兜底。

1. 压缩并缓存所有图像（`ImageCache`）
2. 若配置了 vision 模型，调用获取描述
3. vision 失败或返回空结果 → 降级到 OCR（tesseract.js）
4. 两者都失败 → 返回 `[Image(s) could not be processed]` 占位符

`ImagePipeline` 支持 `AbortSignal`，可在图像预处理阶段取消。`Harness.promptWithImages()` 将用户上传的图像通过 `ImagePipeline.process()` 处理；MCP 工具结果中的图像同样通过此管道处理。

### Checkpoint 系统

编辑安全网（`src/checkpoint/`），在每次文件修改前自动保存快照，支持完整的 save → commit → rollback 生命周期：

- **save(filePath)** — 修改前复制文件内容到 `.dscode/checkpoints/<sessionId>/`，写入 `meta.json` 记录元数据
- **commit(filePath)** — 修改成功后清理 checkpoint
- **rollback(filePath)** — 修改失败后恢复文件原始内容
- **isDirty / listDirty** — 查询未提交的 checkpoint
- **baseCommit** — 初始化时捕获 git HEAD 作为变更基线

`Harness.initialize()` 初始化 CheckpointManager，使用当前 session ID 隔离不同会话的 checkpoint。

---

## Layer 5: Permissions

### 职责

在 `beforeToolCall` hook 中拦截工具调用，按规则允许/拒绝/询问。

### 决策流程

```
工具调用
  → session 级授权？→ 放行
  → 匹配规则（按 priority 降序）
     → allow → 放行
     → deny → 阻止 + reason
     → ask → 弹出权限对话框 → 用户选择 → 可选 rememberForSession
```

### 默认规则

| 工具 | 决策 |
|------|------|
| `read_file`, `list_files`, `grep`, `glob` | allow |
| `edit`, `write_file`, `overwrite_file` | ask |
| `bash` (危险模式: rm -rf, sudo, chmod 777, mkfs, dd) | deny |
| `bash` (其他) | ask |

### 配置

permission 规则在 `settings.json` 中配置（路径 denyPatterns、自定义工具规则），`PermissionManager` 在构造时加载。

---

## Layer 6: UI

### 双后端架构

| 后端 | 实现 | 入口 |
|------|------|------|
| `TuiBackend` | readline + ANSI escape codes | `dscode` (终端模式) |
| `WebBackend` | WebSocket + HTTP server | `dscode --web` |

两者实现统一的 `UiBackend` 接口：render text/thinking/tool、prompt permissions、slash commands。

### 前端

Web 模式下的前端是独立 Vite + React 项目（`web/`），通过 WebSocket 与后端通信。

### Slash Commands

| 命令 | 功能 |
|------|------|
| `/config` | 配置管理（provider, modelId, apiKey, thinkingLevel, cwd） |
| `/session` | 会话管理（list, load, save, delete, new） |
| `/memory` | 记忆管理（list, add, remove, clear） |
| `/skills` | Skill 列出与激活 |
| `/mcp` | MCP Server 浏览与管理 |
| `/vision` | Vision 模型配置 |
| `/help` | 帮助 |

---

## Harness 组装

`Harness` 类（`src/core/harness.ts`）实现 `HarnessAPI` 接口（`src/core/harness-api.ts`），是进程级 host，负责：

1. 加载配置（config.json + settings.json + env），创建 `ConfigWatch` 统一可观测配置层
2. 实例化各模块：SessionManager, ContextManager, MemoryManager, DriverRegistry, ToolRegistry, SkillManager, PermissionManager, MCPManager, ImagePipeline
3. 初始化 CheckpointManager（编辑安全网）
4. 构建 system prompt = base + skills instructions + memories + AGENTS.md + deferred tools hint
5. 创建 Agent（注入 hooks: transformContext, beforeToolCall, afterToolCall）
6. 绑定事件（UI 渲染、token 校准、session 自动保存）
7. 启动 UI（TUI REPL 或 Web server）
8. 优雅关闭（保存 session, 提取 memory, 关闭 checkpoint 系统）

### System Prompt 构建

```typescript
base prompt
  + skill instructions（每激活一个 skill 追加一段）
  + ## Memories（global + project 记忆，MemoryManager 格式化）
  + AGENTS.md 内容（项目级 agent 指令，最低优先级）
  + deferred tools hint（ToolRegistry 生成的延迟工具提示）
```

### ConfigWatch 可观测配置层

`ConfigWatch`（`src/core/config-watch.ts`）包装 `HarnessConfig`，提供显式 setter 方法和订阅制变更通知：

- `get()` — 返回 `Readonly<HarnessConfig>` 不可变快照
- `onChange(fn)` — 订阅配置变更，返回取消订阅函数
- `setModelConfig()` / `setApiKey()` / `setProjectPath()` / `setVision()` / `setMcpServers()` — 原子化配置修改

所有配置变更通过 ConfigWatch 方法，禁止直接修改 config 属性。Harness 注册 `onChange` 回调通知 UI 后端同步更新。

### HarnessAPI 接口

`HarnessAPI`（`src/core/harness-api.ts`）定义 Harness 的公共 API 表面，TUI 和 Web 后端通过该接口消费 Agent 能力，不依赖 Harness 的内部实现细节：

- **readonly 访问器**: agent, sessionManager, memoryManager, driverRegistry, toolRegistry, skillManager, permissionManager, contextManager, mcpManager, config, configStore, imagePipeline
- **mutation 方法**: `setModel()`, `setThinking()`, `setProvider()`, `updateProjectPath()`, `abort()`
- **执行方法**: `promptWithImages()`, `promptAndSave()`

此接口替代了旧的 `TuiDeps` 反模式，消除了 Web 后端中的 `as any` 类型断言。

## 目录结构

```
src/
├── core/           # 入口 + Harness 组装 + 配置 + 共享类型
│   ├── main.ts
│   ├── harness.ts
│   ├── harness-api.ts     # HarnessAPI 公共接口
│   ├── config.ts
│   ├── config-watch.ts    # 可观测配置层
│   └── types.ts
├── session/        # Layer 1: Session 持久化
│   ├── manager.ts, store.ts, types.ts, display.ts
├── context/        # Layer 2: 上下文管理
│   ├── manager.ts, estimator.ts, compaction.ts
├── memory/         # Layer 3: 记忆系统
│   ├── manager.ts, store.ts
├── drivers/        # Layer 4: 驱动（工具提供者）
│   ├── registry.ts, fs.ts, shell.ts, search.ts, edit/ (tool.ts, hash.ts, recovery.ts, index.ts)
│   ├── discovery.ts, tool-registry.ts
│   └── vision/          # 图像处理管道
│       ├── cache.ts, client.ts, ocr.ts, pipeline.ts
│       ├── reader.ts, types.ts
├── checkpoint/     # Layer 4: 编辑安全网
│   ├── index.ts, checkpoint-manager.ts, snapshot-store.ts, types.ts
│   ├── base-commit.ts, write-tracker.ts
│   └── store/
├── skills/         # Layer 4: 技能（用户态程序）
│   ├── manager.ts, loader.ts
├── mcp/            # MCP 客户端 + App Host
│   ├── client.ts, manager.ts, types.ts
│   └── app/host.ts
├── models/         # 模型注册与解析
│   ├── registry.ts, index.ts, qwen.ts
├── permissions/    # Layer 5: 权限
│   ├── manager.ts, rules.ts
├── ui/             # Layer 6: UI（双后端 + shared state）
│   ├── backend.ts, tui-app.ts, tui-backend.ts
│   ├── web/web-backend.ts, web/ws-server.ts, web/protocol.ts
│   ├── shared/types.ts, shared/reducer.ts
│   ├── commands.ts, conversation.ts, theme.ts
│   ├── image-manager.ts, image-paste-handler.ts
│   └── mcp-browser.ts
└── utils/          # 工具集
    ├── image.ts, image-cache.ts, ocr.ts
    └── at-file-resolver.ts

web/                # Web 前端（独立 Vite + React 项目）
```

### 运行时数据

```
~/.dscode/
├── config.json              # /config 写入的运行时配置
├── settings.json            # 用户级声明式 settings
└── data/
    ├── sessions/<ulid>.json + index.json
    └── memory/global.json + projects/<hash>.json

<project>/.dscode/
├── settings.json            # 项目级 settings（覆盖用户级）
└── checkpoints/             # 编辑安全网快照
    └── <sessionId>/
        ├── <safeFileName>-<timestamp>/
        │   ├── original     # 修改前文件副本
        │   └── meta.json    # 元数据（filePath, baseCommit, timestamp）
        └── ...
```

---

## 参考链接

- [DESIGN.md](./DESIGN.md) — 设计决策记录（ADR）
- [STYLE.md](./STYLE.md) — 编码规范
- [ROADMAP.md](./ROADMAP.md) — 路线图
- [reference/](./reference/) — 技术分析 & 参考资料
- [archive/](./archive/) — 已完成的方案 & 历史记录
