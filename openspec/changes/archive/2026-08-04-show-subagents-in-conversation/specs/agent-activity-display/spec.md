## ADDED Requirements

### Requirement: 对话流展示 Agent Activity

系统 SHALL 将 SubAgent 执行投影为独立 Agent Activity，而不是普通 user 或
assistant 消息。Activity MUST 至少包含 agentId、Application、attachment、状态、
输入摘要和时间信息。

#### Scenario: Foreground Agent 启动
- **WHEN** Main Agent 启动一个 foreground SubAgent
- **THEN** 当前对话流出现一条独立 Agent Activity，并显示 Application 与 running 状态

#### Scenario: Background Agent 启动
- **WHEN** Main Agent 启动一个 background SubAgent
- **THEN** Agent Activity 明确标识 background，且 Main Agent 后续消息可继续显示

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

TUI SHALL 使用与 Web 相同的 Agent Activity 数据语义，显示 Application、状态、
耗时、输入摘要和终态结果摘要。TUI MAY 使用紧凑文本块替代可展开 Web 卡片。

#### Scenario: TUI Agent 完成
- **WHEN** TUI 当前 Session 中的 SubAgent 完成
- **THEN** 对话区域显示该 Agent 的 completed 状态、耗时和结果摘要，而不只显示 toast

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
