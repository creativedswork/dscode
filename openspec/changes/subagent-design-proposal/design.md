## Context

当前 AI 编程助手系统采用单一 Agent 架构，所有工具调用都在主 Agent 上下文中执行。随着任务复杂度增加，面临以下挑战：

- **上下文窗口膨胀**：复杂任务产生的工具调用结果占据大量上下文，导致后续交互质量下降
- **任务耦合**：所有操作串行执行，无法并行处理独立子任务
- **专业化不足**：主 Agent 在特定领域（如大规模代码搜索、独立审查）缺乏针对性的系统提示
- **缓存利用率低**：每次任务切换需重新构建完整上下文，无法复用 Prompt Cache

参考 Claude Code 的 SubAgent 架构，设计一套完整的子代理系统，使主 Agent 能将任务委派给专业化子代理执行。子代理拥有独立的执行上下文、工具权限和系统提示，并可并行运行。

## Goals / Non-Goals

**Goals:**
- 实现 `AgentTool` 工具，使主 Agent 能通过工具调用方式委派子代理执行任务
- 支持内置代理（Explore、Plan、general-purpose 等）和用户自定义代理
- 支持同步、异步/后台、Fork 三种执行模式
- 实现 Fork Subagent 机制以最大化 Prompt Cache 命中率
- 提供代理工具过滤与权限控制，确保子代理仅使用被授权的工具
- 支持 Agent Memory 持久化记忆，子代理可跨会话保留学习成果
- 支持 Worktree 文件系统隔离，子代理可在独立副本中工作
- 实现基于 AsyncLocalStorage 的并发安全上下文追踪

**Non-Goals:**
- 多 Agent 协作/群组（Agent Swarms/Teams）—— 这是更高级的协作模式，需独立设计
- 远程执行环境（Remote Isolation）—— 作为独立能力后续支持
- 子代理的流式输出到前端 —— 仅支持进度状态点更新

## Decisions

### 1. AgentTool 作为标准工具

**决策**：子代理调用通过 `AgentTool` 工具实现，与其他工具（Bash、Read、Write 等）处于同一抽象层次。

**理由**：
- 模型无需学习新的调用协议，子代理调用与 Bash 调用遵循相同的工具调用模式
- 工具过滤、权限校验、YOLO 分类等现有基础设施可直接复用
- prompt 生成可统一管理，`getPrompt()` 返回工具描述时包含可用代理列表

**替代方案**：独立的 Agent 编排引擎—— 需要模型学习额外的协议，增加复杂性。

### 2. 三种执行模式：Sync / Async / Fork

**决策**：`AgentTool` 支持三种执行模式，由调用参数和代理定义共同决定：

| 模式 | 触发条件 | 特点 |
|------|----------|------|
| **Sync** | 默认 | 阻塞父代理，完成返回结果 |
| **Async** | `run_in_background: true` 或 `background: true` | 后台运行，父代理收到 task-notification |
| **Fork** | 省略 `subagent_type`（gate 开启时） | 继承父代理完整上下文，共享 Prompt Cache |

**理由**：
- Sync 适合快速子任务（Explore 搜索），结果直接用于当前对话流
- Async 适合长任务（Plan 规划、大规模重构），不阻塞主流程
- Fork 最大化缓存命中：子代理复用父代理的系统提示、工具定义和上下文前缀

**替代方案**：仅支持 Sync —— 但长任务会阻塞用户交互，且无法利用 Prompt Cache。

### 3. Fork Subagent 的 Cache 共享策略

**决策**：Fork 子代理复用父代理的：
1. 系统提示（逐字节相同）
2. 工具定义（`useExactTools`，不重新 assembled）
3. 对话前缀（填充 placeholder tool_results）

通过 `buildForkedMessages()` 构建消息：
```
[...history, assistant(full tool_uses), user(placeholder results..., directive)]
```

仅最后的 directive 文本块因每个 fork 的子任务不同而不同，最大化缓存命中。

**理由**：Anthropic API 的 Prompt Cache 基于前缀匹配。使多个 fork 子代理共享相同前缀，可显著降低 API 成本和延迟。

**替代方案**：每个子代理独立构建系统提示 —— 导致缓存完全失效。

### 4. Agent Context 基于 AsyncLocalStorage

**决策**：使用 Node.js `AsyncLocalStorage` 追踪当前代理身份，而非通过 AppState 全局状态。

**理由**：
- 多个后台代理可并发运行在同一进程，AppState 是单例会被覆盖
- AsyncLocalStorage 天然隔离每个异步执行链，并发代理互不干扰
- 分析事件（`tengu_api_success`）可自动归属到正确的代理

**替代方案**：参数 drilling —— 需要在每个函数签名中添加 agentId 参数，侵入性强。

### 5. 代理定义的三层来源

**决策**：代理定义支持三层来源，按优先级合并：

1. **Built-in**（内置）：代码常量定义（`general-purpose`, `Explore`, `Plan`）
2. **Plugin**（插件）：由插件动态注册
3. **Custom**（自定义）：用户/项目/策略级别的 Markdown/JSON 配置文件

代理目录结构和校验使用 Zod Schema 进行。

**理由**：
- 内置代理提供基础能力
- 插件代理允许扩展
- 自定义代理让用户针对项目定制

### 6. 工具过滤的维度

**决策**：子代理工具权限由以下维度共同决定：

| 维度 | 说明 |
|------|------|
| `ALL_AGENT_DISALLOWED_TOOLS` | 所有子代理都不可用的工具（如 Task/Agent 自身递归防护） |
| `CUSTOM_AGENT_DISALLOWED_TOOLS` | 自定义代理额外禁用的工具 |
| `ASYNC_AGENT_ALLOWED_TOOLS` | 异步代理仅允许使用的工具（排除交互式工具） |
| 代理定义 `tools` | 代理白名单，`*` 表示全部可用 |
| 代理定义 `disallowedTools` | 代理黑名单 |

过滤在 `filterToolsForAgent()` 中统一处理。

**理由**：分层过滤保证了安全底线（内置代理不受 CUSTOM 限制），同时允许灵活配置。

### 7. Agent Memory 持久化设计

**决策**：代理记忆存储为 `MEMORY.md` 文件，按作用域分目录：

- **user**: `~/.claude/agent-memory/<agentType>/MEMORY.md`
- **project**: `.claude/agent-memory/<agentType>/MEMORY.md`
- **local**: `.claude/agent-memory-local/<agentType>/MEMORY.md`

在代理系统提示中自动注入记忆内容，代理通过 FileWrite 更新记忆。

**理由**：
- Markdown 格式便于人工编辑和模型阅读
- 三级作用域允许跨项目（user）、项目级（project）和本地（local）的记忆策略
- 使用文件系统而非数据库，简化实现

### 8. 进度追踪与后台通知

**决策**：后台代理通过 `<task-notification>` XML 消息通知父代理完成状态。进度通过 `AgentProgress` 状态追踪（工具调用数、Token 消耗、最近活动）。

通知内容包括：
- 状态（completed/failed/killed）
- 最终消息摘要
- 使用量统计（Token 数、工具调用数、耗时）
- Worktree 路径（如有）

**理由**：标准化的通知格式使父代理能可靠地处理后台任务结果。

## Risks / Trade-offs

- **[递归分叉爆炸]** Fork 子代理仍持有 AgentTool，可能再次 fork → 通过 `isInForkChild()` 检查对话历史中的 `FORK_BOILERPLATE_TAG` 来阻止递归 fork
- **[Prompt Cache 失效]** 系统提示或工具定义的任何变化都会使 Fork 缓存失效 → Fork 路径传递父代理的渲染字节串，而非重新计算
- **[并发状态冲突]** 多个后台代理同时写文件 → 各代理使用独立 Worktree，文件操作隔离
- **[Token 成本]** 子代理可能产生大量 Token 消耗 → 设置 `maxTurns` 限制、使用 `haiku` 等轻量模型（如 Explore 代理）
- **[权限泄漏]** 子代理可能获得超出预期的工具权限 → 多层过滤机制 + 独立 permission mode

## Open Questions

- Fork Subagent 与普通 Subagent 的使用边界如何向模型清晰传达？（当前通过 whenToUse 描述和示例引导）
- Agent Memory 是否应支持自动总结/压缩老旧记忆？
- 子代理失败时的重试策略由主 Agent 自行决定还是系统内置？
