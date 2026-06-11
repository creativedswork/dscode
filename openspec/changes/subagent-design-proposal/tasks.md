## 1. Agent Definition System

- [ ] 1.1 定义 `AgentDefinition` 核心类型（BaseAgentDefinition、BuiltInAgentDefinition、CustomAgentDefinition、PluginAgentDefinition）
- [ ] 1.2 实现 `loadAgentsDir()` 逻辑：内置代理加载、用户/项目/策略目录扫描、插件代理注册
- [ ] 1.3 实现 Zod Schema 校验（`AgentJsonSchema`、`AgentsJsonSchema`）
- [ ] 1.4 实现 `filterAgentsByMcpRequirements()` MCP 依赖筛选
- [ ] 1.5 实现 `hasRequiredMcpServers()` 校验函数
- [ ] 1.6 实现内置代理定义（`general-purpose`、`Explore`、`Plan`）

## 2. AgentTool Core

- [ ] 2.1 实现 `AgentTool` 工具类：`inputSchema`、`outputSchema`、`prompt()`、`description()`
- [ ] 2.2 实现 `getPrompt()` 代理列表提示生成（含 Fork 模式示例）
- [ ] 2.3 实现 `AgentTool.call()` 主调用逻辑：参数解析、代理筛选、模式分发
- [ ] 2.4 实现 `AgentTool` 权限集成（`filterDeniedAgents`、`getDenyRuleForAgent`）
- [ ] 2.5 实现 `ONE_SHOT_BUILTIN_AGENT_TYPES` 一次性代理优化（省略 SendMessage trailer）
- [ ] 2.6 实现代理颜色管理（`setAgentColor`、`agentColorManager`）

## 3. Agent Execution Engine

- [ ] 3.1 实现 `runAgent()` 核心生成器：接受代理定义、提示消息、上下文、工具
- [ ] 3.2 实现代理系统提示构建管线：`getSystemPrompt` + `enhanceSystemPromptWithEnvDetails` + `buildEffectiveSystemPrompt`
- [ ] 3.3 实现 `initializeAgentMcpServers()` MCP 服务器初始化与合并
- [ ] 3.4 实现代理上下文创建：文件缓存克隆、用户/系统上下文获取
- [ ] 3.5 实现代理查询循环（基于 `query()` 的 AsyncGenerator）
- [ ] 3.6 实现侧链转录记录（`recordSidechainTranscript`、`setAgentTranscriptSubdir`）
- [ ] 3.7 实现 AbortController 集成与中断处理

## 4. Sync Agent Lifecycle

- [ ] 4.1 实现同步代理执行循环：消息产出、后台提示 UI（`PROGRESS_THRESHOLD_MS`）
- [ ] 4.2 实现 `registerAgentForeground()` 前台任务注册
- [ ] 4.3 实现自动后台化机制（`autoBackgroundMs` + `Promise.race` 竞态）
- [ ] 4.4 实现后台化后的执行延续（`agentIterator.return()` + 新 `runAgent()` 调用）
- [ ] 4.5 实现 `finalizeAgentTool()` 结果聚合与统计

## 5. Async Agent Lifecycle

- [ ] 5.1 实现 `registerAsyncAgent()` 后台任务注册
- [ ] 5.2 实现 `runAsyncAgentLifecycle()` 异步代理生命周期管理
- [ ] 5.3 实现 `completeAgentTask()` / `failAgentTask()` / `killAsyncAgent()` 任务终结
- [ ] 5.4 实现 `enqueueAgentNotification()` 完成通知推送
- [ ] 5.5 实现 `LocalAgentTaskState` 任务状态类型与管理
- [ ] 5.6 实现代理名称注册表（`agentNameRegistry`）用于 SendMessage 路由

## 6. Fork Subagent

- [ ] 6.1 实现 `isForkSubagentEnabled()` Fork gate 检查
- [ ] 6.2 实现 `FORK_AGENT` 定义（`agentType: "fork"`、`permissionMode: "bubble"`、`useExactTools`）
- [ ] 6.3 实现 `buildForkedMessages()` 分叉消息构建
- [ ] 6.4 实现 `buildChildMessage()` Fork 子代理行为指令生成
- [ ] 6.5 实现 `isInForkChild()` 递归分叉检测
- [ ] 6.6 实现 `CacheSafeParams` 缓存参数传递
- [ ] 6.7 实现 Fork + Worktree 路径翻译通知（`buildWorktreeNotice`）

## 7. Agent Context (AsyncLocalStorage)

- [ ] 7.1 实现 `AgentContext` 类型系统（`SubagentContext`、`TeammateAgentContext`、联合类型）
- [ ] 7.2 实现 `agentContextStorage` AsyncLocalStorage 实例
- [ ] 7.3 实现 `runWithAgentContext()` 上下文执行包装
- [ ] 7.4 实现 `getAgentContext()` 上下文获取
- [ ] 7.5 实现 `getSubagentLogName()` 分析用代理名称
- [ ] 7.6 实现 `consumeInvokingRequestId()` 一次性 request ID 消费
- [ ] 7.7 实现类型守卫（`isSubagentContext`、`isTeammateAgentContext`）

## 8. Agent Tool Filtering

- [ ] 8.1 定义常量集：`ALL_AGENT_DISALLOWED_TOOLS`、`CUSTOM_AGENT_DISALLOWED_TOOLS`、`ASYNC_AGENT_ALLOWED_TOOLS`
- [ ] 8.2 实现 `filterToolsForAgent()` 多层过滤函数
- [ ] 8.3 实现 `resolveAgentTools()` 工具规格解析（通配符、显式列表、allowedAgentTypes）
- [ ] 8.4 实现 `Agent(x, y)` 工具规格语法解析

## 9. Agent Memory

- [ ] 9.1 实现 `getAgentMemoryDir()` 三级作用域路径解析
- [ ] 9.2 实现 `loadAgentMemoryPrompt()` 记忆加载与系统提示注入
- [ ] 9.3 实现 `isAgentMemoryPath()` 路径安全校验
- [ ] 9.4 实现 `getAgentMemoryEntrypoint()` 记忆入口文件路径
- [ ] 9.5 实现 `ensureMemoryDirExists()` 记忆目录自动创建

## 10. Agent Progress & Notification

- [ ] 10.1 实现 `ProgressTracker` 与 `createProgressTracker()`
- [ ] 10.2 实现 `updateProgressFromMessage()` 进度更新（Token 计数、工具活动记录）
- [ ] 10.3 实现 `createActivityDescriptionResolver()` 活动描述解析
- [ ] 10.4 实现 `enqueueAgentNotification()` XML 通知格式化
- [ ] 10.5 实现 `startAgentSummarization()` 周期性进度摘要
- [ ] 10.6 实现 `emitTaskProgress()` SDK 进度事件

## 11. Agent Resume

- [ ] 11.1 实现 `resumeAgentBackground()` 恢复入口
- [ ] 11.2 实现侧链转录过滤（`filterWhitespaceOnlyAssistantMessages`、`filterOrphanedThinkingOnlyMessages`、`filterUnresolvedToolUses`）
- [ ] 11.3 实现 `reconstructForSubagentResume()` 内容替换状态重建
- [ ] 11.4 实现 Fork 子代理恢复（父代理系统提示重建）
- [ ] 11.5 实现 Worktree 恢复逻辑（路径有效性检查、mtime bumping）

## 12. Agent Isolation

- [ ] 12.1 实现 `createAgentWorktree()` Git Worktree 创建
- [ ] 12.2 实现 `hasWorktreeChanges()` 变更检测
- [ ] 12.3 实现 `removeAgentWorktree()` Worktree 清理
- [ ] 12.4 实现 `runWithCwdOverride()` 工作目录覆写
- [ ] 12.5 实现 `buildWorktreeNotice()` Fork 代理 Worktree 路径翻译通知
- [ ] 12.6 实现 Hook 检测与绕过（hook-based worktree 始终保留）

## 13. Integration & Testing

- [ ] 13.1 将 `AgentTool` 注册到工具池（`assembleToolPool` 集成）
- [ ] 13.2 实现代理定义变更时的工具 Schema 缓存失效逻辑
- [ ] 13.3 实现 `agent_listing_delta` attachment 消息注入（可选优化）
- [ ] 13.4 编写 AgentTool 单元测试（同步/异步/Fork 模式）
- [ ] 13.5 编写 `runAgent` 单元测试（系统提示构建、MCP 初始化、中断处理）
- [ ] 13.6 编写代理定义加载与校验单元测试
- [ ] 13.7 端到端测试：主 Agent 委派 Explore 子代理搜索代码
