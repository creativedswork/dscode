# Agent Harness 分层架构总览

基于 `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` 构建的完整 CLI Agent Harness 系统。

## 设计哲学

从最内层到最外层逐步构建，每一层只依赖其内侧的层：

```
┌─────────────────────────────────────────────────────────┐
│  Layer 6: UI / Rendering (REPL, 流式渲染, slash commands) │
├─────────────────────────────────────────────────────────┤
│  Layer 5: Permission / Safety (beforeToolCall 实现)       │
├─────────────────────────────────────────────────────────┤
│  Layer 4: Skills / Plugins (工具注册, 技能包)             │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Memory (跨 session 记忆, 注入 system prompt)    │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Context Management (token 预估, 压缩, overflow) │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Session (会话持久化, 恢复, 历史)                │
├─────────────────────────────────────────────────────────┤
│  Layer 0: Agent Loop (pi-agent-core + pi-ai, 已有)       │
└─────────────────────────────────────────────────────────┘
```

## 底层库能力边界

### pi-agent-core 提供（不需要重建）

| 能力 | API |
|------|-----|
| Agent 状态管理 | `Agent` class, `AgentState` |
| 事件驱动 | `agent.subscribe()`, `AgentEvent` 联合类型 |
| 工具执行循环 | 自动 loop: model → tool call → execute → feed back |
| 并行/串行工具 | `toolExecution: "parallel" \| "sequential"` |
| 上下文变换 hook | `transformContext(messages, signal) → messages` |
| 工具前置拦截 | `beforeToolCall(context, signal) → block/allow` |
| 工具后置处理 | `afterToolCall(context, signal) → modify result` |
| 中途注入 | `agent.steer()`, `agent.followUp()` |
| 取消 | `agent.abort()` |

### pi-ai 提供（不需要重建）

| 能力 | API |
|------|-----|
| 25+ LLM 提供商 | `getModel(provider, modelId)` |
| 流式输出 | `streamSimple(model, context, options)` |
| Token 用量追踪 | `AssistantMessage.usage` (input/output/cache) |
| Prompt Caching | `cacheRetention`, `sessionId` |
| Overflow 检测 | `isContextOverflow(message, contextWindow)` |
| 模型元数据 | `Model.contextWindow`, `Model.maxTokens`, `Model.cost` |

### 需要自建的

- 会话持久化 (Session)
- 上下文压缩 (Context Compaction)
- Token 估算 (无本地 tokenizer)
- 跨 session 记忆 (Memory)
- 技能/插件框架 (Skills)
- 权限系统 (Permissions)
- CLI UI (REPL, 渲染, slash commands)
- 配置系统
- Host (Harness: 组装各层, 管理生命周期)

## 目录结构

遵循 core + modules 风格，短命名，无编号前缀：

```
src/
├── core/
│   ├── main.ts             # 入口
│   ├── harness.ts          # host / composition root
│   ├── config.ts           # 配置加载 (env + config.json + settings.json)
│   └── types.ts            # 跨模块共享类型
│
├── session/
│   ├── manager.ts          # create / save / load / list / delete
│   └── store.ts            # FileStore 实现 (JSON, atomic write)
│
├── context/
│   ├── manager.ts          # transformContext hook 实现
│   ├── estimator.ts        # 启发式 token 计数
│   └── compaction.ts       # 压缩策略: drop-oldest, sliding-window, summarize
│
├── memory/
│   ├── manager.ts          # 注入 / 提取 / 查询
│   └── store.ts            # ~/.dscode/data/memory 下的 JSON 文件
│
├── skills/
│   ├── registry.ts         # register / activate / deactivate
│   ├── fs.ts               # read_file, write_file, list_files
│   ├── shell.ts            # bash 工具
│   └── search.ts           # grep, glob
│
├── mcp/
│   ├── client.ts           # MCP 客户端 (stdio/SSE)
│   ├── manager.ts          # MCP 多 Server 生命周期管理
│   └── types.ts            # MCP 协议类型定义
│
├── permissions/
│   ├── manager.ts          # beforeToolCall hook 实现
│   └── rules.ts            # 默认规则集
│
└── ui/
    ├── repl.ts             # readline REPL 循环
    ├── render.ts           # AgentEvent → 终端输出
    └── commands.ts         # slash commands 注册与分发

```

运行时数据目录：

```
~/.dscode/
├── config.json             # `/config` 写入的用户命令配置（model / thinking / cwd / apiKey）
├── settings.json           # 用户级声明式 settings（permissions / mcp / skills）
└── data/
    ├── sessions/
    │   ├── <ulid>.json     # 单个 session 完整数据
    │   └── index.json      # 元数据索引
    └── memory/
        ├── global.json     # 全局记忆
        └── projects/
            └── <hash>.json # 项目级记忆
```

项目级配置：

```
<project>/.dscode/
└── settings.json           # 项目级声明式 settings（覆盖用户级 settings）
```

环境变量：
- `DSCODE_CONFIG_HOME` → 自定义配置目录（默认 `~/.dscode`）
- `DSCODE_DATA_HOME` → 自定义数据目录（默认 `~/.dscode`）

## Harness (Host) 核心组装

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: buildSystemPrompt(memoryManager, skillRegistry),
    model: getModel(config.provider, config.modelId),
    tools: skillRegistry.getTools(),
    thinkingLevel: config.thinkingLevel,
  },
  streamFn: streamSimple,
  transformContext: (msgs, signal) => contextManager.transform(msgs, signal),
  beforeToolCall: (ctx, signal) => permissionManager.check(ctx, signal),
  sessionId: sessionManager.getCurrentSessionId(),
});
```

## 实施顺序

| 阶段 | 内容 | 前置依赖 |
|------|------|----------|
| 1 | 脚手架 + Layer 6 基础 REPL + Layer 0 对接 | 无 |
| 2 | Layer 4 内置 Skills | Phase 1 |
| 3 | Layer 5 Permission 系统 | Phase 2 |
| 4 | Layer 1 Session 持久化 | Phase 1 |
| 5 | Layer 2 Context 管理 | Phase 1 |
| 6 | Layer 3 Memory 系统 | Phase 4, 5 |
| 7 | 集成测试 + 配置系统 + 打磨 | 全部 |

## 文档索引

- [Layer 0: Agent Loop](./layer0-agent-loop.md)
- [Layer 1: Session Management](./layer1-session.md)
- [Layer 2: Context Management](./layer2-context.md)
- [Layer 3: Memory System](./layer3-memory.md)
- [Layer 4: Skills / Plugins](./layer4-skills.md)
- [Layer 5: Permissions / Safety](./layer5-permissions.md)
- [Layer 6: UI / Rendering](./layer6-ui.md)
- [Harness (Host)](./harness.md)
- [编码规范](./coding-style.md)
- [设计决策记录](./design-decisions.md)
