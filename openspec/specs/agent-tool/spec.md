# agent-tool Specification

## Purpose
TBD - created by archiving change subagent-design-proposal. Update Purpose after archive.
## Requirements
### Requirement: spawn_agent 启动进程

系统 SHALL 提供 `spawn_agent` 标准工具。输入 MUST 包含 `application`、`description` 和通用 `input` 信封；`input` MUST 包含 prompt，并 MAY 包含带类型的 attachments。工具 MAY 包含 `attachment`、`context_mode`、类型化 `selected_context` 和 `isolation`，但 MUST NOT 覆盖 Application 的 model、tools、Skills、MCP、Hooks、权限或 fallback。

#### Scenario: Foreground 启动
- **WHEN** Main Agent 调用 `spawn_agent` 且 attachment 为 foreground
- **THEN** 系统启动指定 Application 的子进程并等待其退出

#### Scenario: Background 启动
- **WHEN** Main Agent 调用 `spawn_agent` 且 attachment 为 background
- **THEN** 工具在进程进入 running 后返回 agentId，子进程继续运行

### Requirement: Selected Context 结构

`selected_context` SHALL 使用 `ContextSelection`，包含非空且有序的 `items`，并 MAY 包含 `maxBytes` 和显式 overflow 策略。每个 item MUST 是 message、tool_result、file 或 diff 的带判别类型引用，不得接受无类型字符串。

#### Scenario: 选择部分上下文
- **WHEN** spawn_agent 使用 `context_mode: selected` 并提供合法 message、file 和 diff items
- **THEN** ContextAssembler 按 items 顺序解析并将固定快照注入子 Agent 初始上下文

#### Scenario: Selected 缺少选择项
- **WHEN** context_mode 为 selected 但 selected_context 缺失或 items 为空
- **THEN** 参数校验失败且不创建 AgentProcess

#### Scenario: 其他模式携带选择项
- **WHEN** context_mode 为 minimal 或 fork 且提供 selected_context
- **THEN** 参数校验失败，不得静默忽略该字段

### Requirement: Selected Context 校验与快照

ContextAssembler SHALL 校验消息和工具结果属于父 Agent 可见转录，并校验文件和 Diff 位于允许的项目或 Worktree 边界。解析结果 SHALL 保存引用、内容 digest、实际字节数和截断信息。Selected context MUST NOT 扩大子 Agent capability。

#### Scenario: 引用不可见父消息
- **WHEN** selected_context 引用其他 Session 或不可见 Agent 的 messageId
- **THEN** spawn 失败并返回引用不可见诊断

#### Scenario: 超过上下文预算
- **WHEN** 解析结果超过 maxBytes 且 overflow 为 error
- **THEN** spawn 失败且不创建 Runtime

#### Scenario: 显式截断
- **WHEN** 解析结果超过 maxBytes 且 overflow 为 truncate-tail
- **THEN** ContextAssembler 确定性截断尾部并在 selection snapshot 中记录截断信息

### Requirement: Agent 通用附件

Supervisor 内部 spawn API SHALL 使用 `AgentProcessInput.attachments` 传递 image、file 和 text Attachment。模型可调用的 `spawn_agent` 工具 SHALL 只接受已缓存或已授权的引用，不接受任意 base64 或越权文件 URI。

#### Scenario: Harness 启动 Vision Agent
- **WHEN** Harness 收到用户上传的 ImageContent
- **THEN** Harness 将图片包装为 type=image Attachment 并放入 input 信封，Process Store 只保存缓存后的 ImageRef

#### Scenario: 模型传递图片
- **WHEN** Main Agent 调用 spawn_agent 并引用已缓存图片
- **THEN** 工具校验 ImageRef 后转换为 type=image Attachment，再通过同一内部 SpawnAgentRequest 启动子进程

### Requirement: Application 必须显式指定

spawn_agent SHALL 要求显式 application。系统 MUST NOT 假设不存在的 general Application，也不得因省略 application 隐式触发 Fork。

#### Scenario: 缺少 Application
- **WHEN** Main Agent 只提供 description 和 input
- **THEN** 参数校验失败且不创建进程

### Requirement: spawn 参数覆盖边界

调用参数 SHALL 只能覆盖 Application 声明允许覆盖的运行字段。调用方 MUST NOT 通过工具参数扩大 tools、permissionMode 或 bypass policy。

#### Scenario: 非法权限覆盖
- **WHEN** spawn 参数尝试设置 bypassPermissions
- **THEN** 参数校验失败且不创建进程

### Requirement: list_agents 查询进程表

系统 SHALL 提供 `list_agents`，返回当前 Main Agent 可见的后代进程及其 agentId、parentAgentId、applicationName、state、attachment、description 和 elapsed time。

#### Scenario: 查询后台进程
- **WHEN** Main Agent 启动一个后台 Agent 后调用 list_agents
- **THEN** 返回该 Agent 的 running 状态和 background attachment

### Requirement: wait_agent 等待退出

系统 SHALL 提供 `wait_agent`，按 agentId 等待进程进入终态，并支持有上限的 timeout。

#### Scenario: 等待完成
- **WHEN** 调用 wait_agent 等待正在运行的 Agent
- **THEN** Agent 退出后返回 AgentExitResult

### Requirement: get_agent_output 获取输出

系统 SHALL 提供 `get_agent_output`，返回进程当前输出、进度、Usage 和终态结果。非父进程或无权限调用方 MUST 被拒绝。

#### Scenario: 查看后台输出
- **WHEN** Main Agent 查询自己的后台子进程
- **THEN** 返回截至当前已持久化的输出和进度

### Requirement: terminate_agent 与 kill_agent

系统 SHALL 提供协作式 `terminate_agent` 和强制 `kill_agent`。terminate SHALL 请求 Agent 在安全边界退出；kill SHALL 中止 AgentProcessRuntime 和运行中的可取消工作。

#### Scenario: 强制终止
- **WHEN** Main Agent kill 一个运行中的子进程
- **THEN** 子进程进入 killed 终态并产生 agent:exit 事件

### Requirement: suspend_agent 与 continue_agent

系统 SHALL 提供 `suspend_agent` 和 `continue_agent`。当 AgentProcessRuntime 支持 suspension 时，suspend SHALL 在安全边界将进程切换为 stopped，continue SHALL 使用同一 agentId 和 runtime state 恢复运行。

#### Scenario: 暂停并继续
- **WHEN** Main Agent suspend 一个 running Agent 后再调用 continue_agent
- **THEN** Agent 经 stopped 回到 running，且不重新创建进程

#### Scenario: Runtime 不支持暂停
- **WHEN** Main Agent 对不支持 suspension 的 AgentProcessRuntime 调用 suspend_agent
- **THEN** 工具返回 unsupported，Agent state 不发生伪造变化

### Requirement: send_agent_message 进程间通信

系统 SHALL 提供 `send_agent_message`，仅允许向支持 messaging capability 且处于 running、waiting 或 stopped 的可见进程发送消息。PiAgentRuntimeAdapter SHALL 将消息放入 steering 或 follow-up queue。

#### Scenario: 追加调查要求
- **WHEN** Main Agent 向运行中的 Explore Agent 发送新要求
- **THEN** 目标 Agent 在下一安全消息注入点接收该要求

#### Scenario: Runtime 不支持消息
- **WHEN** Main Agent 向不支持 messaging capability 的 AgentProcessRuntime 发送消息
- **THEN** 工具返回 unsupported，不重启或替换目标 Agent

### Requirement: 进程工具的递归控制

SubAgent 默认 MUST 不可见 `spawn_agent`。只有 Application capability 和系统最大深度同时允许时，才可启动子进程。

#### Scenario: 默认禁止嵌套
- **WHEN** depth 为 1 的普通 SubAgent 尝试调用 spawn_agent
- **THEN** 工具不可见或调用被权限层拒绝
