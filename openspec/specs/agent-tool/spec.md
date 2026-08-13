# agent-tool Specification

## Purpose
TBD - created by archiving change subagent-design-proposal. Update Purpose after archive.
## Requirements
### Requirement: spawn_agent 启动进程

系统 SHALL 提供 `spawn_agent` 标准工具。输入 MUST 包含 `application`、`description` 和通用 `input` 信封；`description` SHALL 使用 `<Role>: <purpose>` 表达用户可见角色与本次职责；`input` MUST 包含 prompt，并 MAY 包含带类型的 attachments。工具 MAY 包含 `background`、`context_mode` 和类型化 `selected_context`，但 MUST NOT 覆盖 Application 的 model、tools、Skills、MCP、Hooks、权限或 fallback。`background` 显式值 SHALL 覆盖 AgentApplication 的用户配置；省略时 SHALL 使用 Application 配置，未配置时 SHALL 默认为 foreground。

#### Scenario: Foreground 启动
- **WHEN** Main Agent 以 `background: false` 调用 `spawn_agent`，或省略参数且 Application 未配置 background
- **THEN** 系统启动指定 Application 的子进程并等待其退出

#### Scenario: Background 启动
- **WHEN** Main Agent 以 `background: true` 调用 `spawn_agent`，或省略参数且 Application 配置 `background: true`
- **THEN** 工具在进程进入 running 后返回 agentId，子进程继续运行

#### Scenario: 后续工作依赖委派结果
- **WHEN** Main Agent 必须取得 SubAgent 结果后才能执行下一步，即使 Application 缺省为 background
- **THEN** Main Agent 显式传入 `background: false` 并直接消费 `spawn_agent` 返回结果

#### Scenario: 使用 general 执行 Researcher 角色
- **WHEN** Main Agent 以 application=`general`、description=`Researcher: verify claims` 启动 SubAgent
- **THEN** Process 保留 general 作为内部 Application，并使用 Researcher 作为用户可见角色

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

`spawn_agent` SHALL 要求显式 application。系统 SHALL 提供名为 `general` 的 bundled
Application，但 MUST NOT 在省略 application 时隐式选择 `general`，也不得因省略 application
隐式触发 Fork。

#### Scenario: 显式使用 general
- **WHEN** Main Agent 没有找到职责匹配的专业 Agent.md 并指定 application 为 `general`
- **THEN** 系统通过标准 Application 创建链启动通用 SubAgent

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

### Requirement: 模型工具不轮询 Agent 结果

系统 MUST NOT 向模型暴露 `wait_agent` 或 `get_agent_output`。Supervisor MAY 保留等待和状态查询内部 API，供 Runtime、UI、测试和系统调度使用，但 Main Agent SHALL 通过 foreground 工具返回或 background 完成通知取得结果。

#### Scenario: 后台 Agent 完成
- **WHEN** background Agent 进入终态
- **THEN** 系统通过 `agent:exit` 和父 Session 通知传递结果，并事件驱动 Main Agent continuation
- **AND** Main Agent 不发起轮询工具调用

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

### Requirement: spawn_agent 展示可选 Application

`spawn_agent` 的模型可见工具描述 SHALL 包含当前 AgentApplicationRegistry 中全部有效
Application 的 name 和 description，并 SHALL 按 name 稳定排序。该 catalog SHALL 在工具描述
被读取时从 Registry 获取，MUST NOT 固化为 Harness 初始化时的旧快照。

#### Scenario: Main 选择专业 Agent
- **WHEN** Registry 包含 `general`、`vision` 和项目级 `reviewer`
- **THEN** Main Agent 在调用 `spawn_agent` 前能从工具描述看到三个名称及其用途

#### Scenario: Registry reload 后选择新 Agent
- **WHEN** 项目切换使 Registry 从 `reviewer` 变为 `researcher`
- **THEN** 后续模型请求中的 `spawn_agent` 描述包含 `researcher` 且不再包含旧项目的 `reviewer`

### Requirement: spawn_agent 解析项目内图片 attachment

模型可调用的 `spawn_agent` SHALL 接受 `file` attachment 引用父 Agent cwd 内已经存在的本地
图片。工具 MUST 在创建 Process 前解析真实路径、校验 cwd 边界与文件类型、限制单图最大
20MB，并 SHALL 通过 ImageCache 将其转换为标准 image attachment。调用方提供的
`image_ref` MUST 是已经存在的单一缓存文件名，MUST NOT 接受本地路径或 `file://` URI。

#### Scenario: 传递刚生成的 PNG
- **WHEN** Main Agent 使用 file attachment 传入 cwd 内存在的 PNG 路径
- **THEN** `spawn_agent` 将图片缓存为 ImageRef，并让子 Process 收到 type=image attachment

#### Scenario: file URI 指向 cwd 外部
- **WHEN** file attachment 的真实路径位于父 Agent cwd 外部或通过软链接逃逸
- **THEN** `spawn_agent` 在创建 Process 前拒绝调用并返回路径越界诊断

#### Scenario: 路径伪装成 image_ref
- **WHEN** 调用方把本地路径或 `file://` URI 填入 `image_ref.hash`
- **THEN** `spawn_agent` 拒绝调用并提示本地图片应使用 file attachment

#### Scenario: 缓存引用不存在
- **WHEN** 调用方提供格式合法但 ImageCache 中不存在的 image_ref
- **THEN** `spawn_agent` 拒绝调用且不启动无法获得图片的子 Process
