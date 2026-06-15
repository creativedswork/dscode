## ADDED Requirements

### Requirement: runAgent 核心接口
系统 SHALL 提供 `runAgent()` 函数作为所有子代理执行的统一入口，返回 `AsyncGenerator<Message>`。

`runAgent()` 的参数 MUST 包括：
- `agentDefinition`：代理定义
- `promptMessages`：初始提示消息
- `toolUseContext`：工具使用上下文
- `canUseTool`：权限检查函数
- `isAsync`：是否异步模式
- `querySource`：查询来源标识
- `availableTools`：可用工具池

#### Scenario: 基本调用
- **WHEN** 调用 `runAgent({agentDefinition: ExploreAgent, promptMessages: [...], ...})`
- **THEN** 返回异步生成器，逐个产出子代理的响应消息

### Requirement: 系统提示构建
系统 SHALL 为子代理构建独立系统提示，流程为：
1. 调用 `agentDefinition.getSystemPrompt()` 获取基础提示
2. 调用 `enhanceSystemPromptWithEnvDetails()` 添加环境信息（绝对路径、Emoji 指导等）
3. 注入 Agent Memory（如配置）
4. 使用 `buildEffectiveSystemPrompt()` 组装最终提示

#### Scenario: 环境信息增强
- **WHEN** 子代理系统提示构建完成
- **THEN** 系统提示中包含当前工作目录的绝对路径、平台信息等环境细节

#### Scenario: Agent Memory 注入
- **WHEN** 代理定义 `memory: "project"`
- **THEN** 系统提示中包含 `.claude/agent-memory/<agentType>/MEMORY.md` 的内容

### Requirement: MCP 服务器初始化
子代理 SHALL 初始化其专属 MCP 服务器（定义在 `agentDefinition.mcpServers`），并与父代理的 MCP 客户端合并。

子代理专属 MCP 服务器的生命周期 MUST：
- 在子代理启动时连接
- 在子代理结束时清理

#### Scenario: 代理专属 MCP
- **WHEN** 代理定义 `mcpServers: [{myServer: {...}}]`
- **THEN** `myServer` 在子代理运行期间连接，子代理结束后断开

### Requirement: 同步执行模式
同步模式 SHALL 在主线程内运行子代理，逐条产出消息直到完成或达到 `maxTurns`。

同步代理 SHALL 支持：
- 注册为前台任务，可被 `backgroundAll()` 转为后台
- 在运行超过阈值时显示后台提示 UI
- 通过竞态机制响应后台化信号

#### Scenario: 同步代理自动转后台
- **WHEN** 同步代理运行超过 120 秒且触发自动后台机制
- **THEN** 代理转为后台运行，父代理收到 async_launched 状态

### Requirement: 异步执行模式
异步模式 SHALL 通过 `registerAsyncAgent()` 注册后台任务，在独立的异步上下文中运行。

异步代理的完整生命周期 MUST 包括：
1. 注册任务（`registerAsyncAgent`）
2. 运行 `runAsyncAgentLifecycle`
3. 进度追踪与更新
4. 完成后调用 `completeAgentTask`
5. 发送 `enqueueAgentNotification` 通知父代理

#### Scenario: 异步代理完成通知
- **WHEN** 后台代理成功完成
- **THEN** 系统生成 `<task-notification status="completed">` 消息推送到父代理

### Requirement: 上下文隔离
子代理 SHALL 拥有独立的文件状态缓存（`readFileState`），与父代理的文件读取缓存隔离。

#### Scenario: 文件缓存隔离
- **WHEN** 父代理和子代理先后读取同一文件
- **THEN** 各自的读取缓存独立维护，互不影响

### Requirement: 侧链转录
系统 SHALL 将子代理的完整对话记录到侧链转录文件（sidechain transcript），与主对话分开存储。

转录文件路径 SHALL 为 `subagents/<agentId>.jsonl`。

#### Scenario: 转录记录
- **WHEN** 子代理执行完成
- **THEN** 其所有消息（assistant、user、progress、system）被记录到侧链 JSONL 文件

### Requirement: 中断与中止
子代理 SHALL 支持通过 AbortController 中止执行，中止时 MUST 抛出 `AbortError`。

#### Scenario: 用户取消
- **WHEN** 父代理被用户中断
- **THEN** 其所有运行中的子代理收到中止信号并终止
