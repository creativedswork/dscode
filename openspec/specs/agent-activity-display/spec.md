# agent-activity-display Specification

## Purpose
TBD - created by archiving change show-subagents-in-conversation. Update Purpose after archive.
## Requirements
### Requirement: 对话流展示 Agent Activity

系统 SHALL 将 SubAgent 执行投影为独立 Agent Activity，而不是普通 user 或
assistant 消息。Activity MUST 至少包含 agentId、内部 Application、用户可见角色
label、attachment、状态、输入摘要和时间信息，并 MAY 包含 Tool timeline 与当前
Permission。Web 和 TUI Card MUST 显示角色 label，MUST NOT 将 `general` 等内部
Application 名称作为卡片标题。

#### Scenario: Foreground Agent 启动
- **WHEN** Main Agent 启动一个 foreground SubAgent
- **THEN** 当前对话流出现一条独立 Agent Activity，并显示委派角色与 running 状态

#### Scenario: Background Agent 启动
- **WHEN** Main Agent 启动一个 background SubAgent
- **THEN** Agent Activity 明确标识 background，且 Main Agent 后续消息可继续显示

#### Scenario: General Application 承载 Researcher
- **WHEN** 内部 Application 为 general 且委派 description 为 `Researcher: verify claims`
- **THEN** Card 标题显示 `Researcher`，不显示 `general`

#### Scenario: 内置 Vision Agent 未携带动态角色
- **WHEN** 内部 Application 为 vision 且委派 description 缺失
- **THEN** Card 标题显示 `Vision`，不回退为 `SubAgent`

### Requirement: Agent Activity 实时更新

同一 Agent 的 state、progress、output 和 exit 事件 SHALL 按 agentId 更新同一条
Activity。系统 MUST NOT 为同一 Agent 的每次生命周期事件创建重复卡片。

#### Scenario: Running 转为 waiting
- **WHEN** 已显示的 Agent 从 running 进入 waiting
- **THEN** 原 Activity 的状态更新为 waiting，列表中不新增第二条记录

#### Scenario: Agent 正常完成
- **WHEN** Agent 发布 completed exit result
- **THEN** 原 Activity 更新为 completed，并显示耗时和结果摘要

#### Scenario: Agent 失败
- **WHEN** Agent 发布 failed、terminated 或 killed exit result
- **THEN** 原 Activity 显示对应终态和错误或终止摘要

### Requirement: Web Permission 归属 Agent Activity

Web SHALL 将带可识别 `agentId` 或 `toolCallId` 的 SubAgent Permission 显示在独立
统一审批卡片中，并标注来源 Agent。无法归属到 SubAgent Activity 的 Permission MUST
回退到独立交互控件，不得丢弃审批请求。Agent Activity Card MUST NOT 因待审批请求而
强制展开 Tool timeline 或锁定「Hide tools / Show tools」开关。

#### Scenario: Permission 归属 SubAgent
- **WHEN** SubAgent 的 Tool Activity 与 Permission 具有相同 `toolCallId` 或 `agentId`
- **THEN** Web 在统一审批卡片中显示该 Permission 并标注来源 Agent
- **AND** 该 Permission 不在 Agent Activity Card 内原位渲染

#### Scenario: Agent Activity Card 不因审批而锁定
- **WHEN** 某 Agent Activity 存在待审批 Permission
- **THEN** 该 Agent Activity Card 的 Tool timeline 保持用户当前的展开/折叠状态
- **AND** 「Show tools / Hide tools」开关仍可用，不因审批而禁用

### Requirement: Agent 输出默认摘要折叠

Web Agent Activity Card SHALL 默认展示输入和输出摘要，完整 output 或 error
SHALL 默认折叠并允许用户展开。展开内容 MUST 使用受限高度的滚动容器。

#### Scenario: 完成长输出
- **WHEN** completed Agent 的 output 超过摘要长度
- **THEN** 卡片默认只显示截断摘要，并提供展开完整输出的控件

#### Scenario: 短输出
- **WHEN** completed Agent 的 output 未超过摘要长度
- **THEN** 卡片直接显示完整摘要且不强制用户展开空详情

### Requirement: TUI 紧凑展示

TUI SHALL 使用与 Web 相同的 Agent Activity 数据语义，并 SHALL 将 Activity 渲染为
独立 Execution Card。Card MUST 显示用户可见角色 label、状态、耗时、输入摘要、Tool
summary 和终态结果摘要。完整 Tool timeline、Permission 与 result detail SHALL 通过
owner-aware Activity Inspector 访问；Card 内的摘要 MUST NOT 成为独立权威数据副本。

#### Scenario: TUI Agent 运行
- **WHEN** TUI 当前 Session 中的 SubAgent 正在运行 Tool
- **THEN** 对话区域显示该 Agent 的 running 状态、耗时和当前 Tool
- **AND** Tool 显示在 Agent Card 内
- **AND** `Ctrl+E` 打开 Inspector 时自动定位该 active Agent Tool

#### Scenario: TUI Agent 完成
- **WHEN** TUI 当前 Session 中的 SubAgent 完成
- **THEN** 原 Agent Card 更新为 completed
- **AND** 默认折叠 Tool timeline并显示结果摘要，而不只显示 toast
- **AND** Inspector 仍可按 agentId/toolCallId 访问已投影详情

#### Scenario: TUI Agent 等待授权
- **WHEN** TUI 当前 Session 中的 SubAgent Tool 等待 Permission
- **THEN** 原 Agent Card 更新为 waiting
- **AND** 统一权限面板显示 Permission options，Tool timeline 不强制展开
- **AND** Permission panel 获得最高输入优先级并显示 Agent/Tool owner path

#### Scenario: TUI Agent 在 Inspector 打开期间更新
- **WHEN** selected Agent Activity 收到 progress、output 或 exit snapshot
- **THEN** Card 与 Inspector 原位更新
- **AND** Inspector selection 和用户 disclosure state 不得重置

### Requirement: Session 历史恢复 Agent Activity

加载 Session 时，系统 SHALL 从 `agentMessages` 恢复 Agent Activity。恢复过程
MUST NOT spawn、resume 或重新执行 Agent Process。

#### Scenario: 加载包含三个 Agent 记录的 Session
- **WHEN** Session 包含三个 `agentMessages`
- **THEN** Web 和 TUI 对话历史均恢复三个 Agent Activity
- **AND** Agent Process Table 不新增进程

#### Scenario: 加载旧 Vision 记录
- **WHEN** legacy `visionMessages` 已迁移为 `agentMessages`
- **THEN** UI 使用通用 Agent Activity 展示该记录，不使用 Vision 专用卡片

### Requirement: Agent Activity 历史保留执行归属与详情引用

系统 SHALL 将 Agent Activity 的 attachment 与可用 Tool timeline 持久化到 Session。
历史恢复 SHALL 保留 foreground/background 归属，并 SHALL 能从持久化的 Agent Process
snapshot 解析 lossless Tool result reference，而不重新执行 Agent。

#### Scenario: 恢复 background Agent
- **WHEN** Session 包含已完成的 background Agent Activity
- **THEN** Web 与 TUI 恢复的 Card 仍标识为 background
- **AND** 不把历史 Activity 默认改为 foreground

#### Scenario: 恢复 Agent Tool 大结果
- **WHEN** 历史 Agent Tool 使用 Agent Process result reference
- **THEN** TUI 预加载对应 Process snapshot 并允许 Inspector 分页查看完整结果
- **AND** Process 缺失或损坏时显示 unavailable 而不是重新执行 Agent

### Requirement: Agent Activity 保持推理隔离

Agent Activity SHALL 仅存在于 display-ready conversation model。系统 MUST NOT
将 Activity、完整 SubAgent transcript 或 UI 状态追加到 Main Agent messages。

#### Scenario: 构建 Main 模型上下文
- **WHEN** 含 Agent Activity 的 Session 发起下一轮 Main Agent prompt
- **THEN** Main Agent context 只包含既有 Main messages 和安全通知注入
- **AND** UI Activity 不作为普通消息进入模型上下文

### Requirement: Agent Activity 按父 Session 路由

实时和历史 Agent Activity MUST 使用显式 `parentSessionId` 路由。当前 UI Session
不得接收属于其他 Session 的 Agent Activity。

#### Scenario: 后台 Agent 跨 Session 完成
- **WHEN** Session A 的 background Agent 在 UI 当前显示 Session B 时完成
- **THEN** Session B 不新增或更新该 Agent Activity
- **AND** 再次加载 Session A 时可从 `agentMessages` 恢复终态 Activity

### Requirement: Agent Activity 包含 Tool timeline

Agent Activity SHALL 可选地包含 executionId、Tool Activity timeline 和当前 Permission。
每个 Tool Activity MUST 至少包含 toolCallId、toolName、状态和开始时间，并 MAY 包含
args summary 与 lossless result detail 或 result reference。

#### Scenario: Tool start 更新 Activity
- **WHEN** SubAgent 发布带 toolCallId 的 Tool start progress
- **THEN** 原 Agent Activity 增加一条 running Tool Activity
- **AND** 保存 args summary
- **AND** 不创建第二个 Agent Card

#### Scenario: Tool end 更新 Activity
- **WHEN** 同一 toolCallId 发布 Tool end progress
- **THEN** 原 Tool Activity 原位更新为 completed 或 failed
- **AND** 保存 endedAt、error 状态和可用 result detail

#### Scenario: 并行同名 Tool
- **WHEN** SubAgent 并行运行两个同名 read_file Tool
- **THEN** timeline 按 toolCallId 保留两个独立 Tool Activity
- **AND** 每个 result detail 只归属自己的 Tool

#### Scenario: Permission 绑定 Activity
- **WHEN** SubAgent Tool 进入 Permission prompt
- **THEN** Agent Activity 携带当前 Permission summary
- **AND** Permission 通过 toolCallId 绑定对应 Tool result owner
- **AND** Permission resolution 后该 summary 被清除

#### Scenario: 旧 Agent Tool Activity
- **WHEN** 历史 Agent Activity 的 Tool 只有 name、status 和 summary
- **THEN** Web 与 TUI 继续显示已有 timeline
- **AND** Inspector 将完整 result 标记为 unavailable 而不是伪造详情

