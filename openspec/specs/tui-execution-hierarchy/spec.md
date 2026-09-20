# tui-execution-hierarchy Specification

## Purpose
TBD - created by archiving change tui-execution-hierarchy-redesign. Update Purpose after archive.
## Requirements
### Requirement: TUI 使用 Turn、Execution 和 Tool 层级

TUI SHALL 将用户轮次展示为 Turn，并 SHALL 将 Main Agent 与每个 SubAgent 展示为
独立 Execution。每个 Tool Activity MUST 只属于一个 Execution。

#### Scenario: Main 委派 SubAgent
- **WHEN** Main Agent 通过 `spawn_agent` 启动 foreground SubAgent
- **THEN** TUI 在当前 Turn 的 Delegation 区域创建 SubAgent Execution Card
- **AND** `spawn_agent` 不重复显示为普通 Main Tool 行

#### Scenario: SubAgent 执行 Tool
- **WHEN** SubAgent 的 Runtime 启动 `bash`
- **THEN** `bash` 显示在该 SubAgent Card 的 Tool timeline 内
- **AND** 不显示在 Main Tool 列表或 Card 外的全局 Tool 区

#### Scenario: spawn 创建前失败
- **WHEN** `spawn_agent` 在 Agent Process 创建前因参数或 Application 错误失败
- **THEN** TUI 显示 failed `spawn_agent` Main Tool
- **AND** 不创建伪造的 SubAgent Card

### Requirement: Thinking 与 Tools 独立折叠

TUI SHALL 为 Main Thinking 和每个 Execution 的 Tools 提供独立折叠状态。折叠状态
MUST 为纯 UI state，不得写入模型 transcript。折叠操作 MUST 通过具有可见 stable
selection 的 Activity Inspector 完成，MUST NOT 依赖 `Ctrl+R`、`Ctrl+O` 或
`Ctrl+N` 隐式猜测目标。

#### Scenario: 运行中默认值
- **WHEN** Execution 进入 running
- **THEN** Thinking 默认折叠为一行摘要
- **AND** Tools 默认展开并显示当前 Tool

#### Scenario: 完成后默认值
- **WHEN** Execution 首次进入 completed
- **THEN** Tools 默认折叠为数量和结果统计摘要
- **AND** 用户仍可在 Inspector 中重新展开 Tool timeline

#### Scenario: 用户手动选择
- **WHEN** 用户在 Inspector 中手动展开或收起 Thinking 或 Tools
- **THEN** 后续相同状态的 progress snapshot 不重置该选择
- **AND** Inspector selection 保持在同一 stable activity identity

#### Scenario: Chat 模式不隐式操作 disclosure
- **WHEN** Editor 聚焦且 Conversation Activity 在后台持续更新
- **THEN** 普通输入与旧 disclosure 快捷键不得改变任意 Thinking 或 Tools 折叠状态

### Requirement: Permission 在所属 Tool 内原位展示

SubAgent Permission prompt SHALL 显示在独立统一权限面板（对话底部），并标注
`Owner: <label> › <toolName>` 来源。Permission 处于待处理状态时，所属 Execution 的
Tools MUST NOT 被强制展开，且 MUST NOT 被禁止收起。TUI MUST 将键盘焦点锁定到
owner-bound Permission panel，并提供不依赖方向键的直接决策键。

#### Scenario: SubAgent 等待 bash 授权
- **WHEN** SubAgent 的 `bash` 触发 Permission prompt
- **THEN** Card 中 `bash` 状态更新为 permission
- **AND** Permission options 显示在对话底部独立权限面板，而非 `bash` 下方
- **AND** panel 明确显示 SubAgent 和 Tool owner path

#### Scenario: Permission 数字键决策
- **WHEN** owner-bound Permission panel 已激活
- **THEN** 用户可使用数字键选择 allow-once、session grant、saved rule 或 guidance
- **AND** 用户可使用 `D` 直接拒绝
- **AND** `Enter` 确认当前 option

#### Scenario: Permission 已解决
- **WHEN** 用户允许或拒绝 Permission
- **THEN** Permission options 从统一权限面板消失
- **AND** 结果归并为对应 Tool 的后续状态
- **AND** TUI 不追加永久 `Permission: allowed` 或 `Permission: denied` 消息
- **AND** 输入焦点恢复到 Permission 出现前的 Inspector 或 Editor

### Requirement: 执行状态采用最具体活动

TUI SHALL 在存在具体 Execution/Tool activity 时显示该活动，并 MUST NOT 同时显示
语义重复的全局 Waiting。

#### Scenario: Tool 正在运行
- **WHEN** Researcher Agent 的 bash 已运行 8 秒
- **THEN** status line 显示 Researcher、bash 和 elapsed time
- **AND** 不显示独立的 `Waiting...` overlay

#### Scenario: 模型尚未产生具体活动
- **WHEN** Main turn 正在处理且不存在 Thinking、Tool、SubAgent 或 Permission activity
- **THEN** TUI MAY 显示全局 Waiting fallback

### Requirement: 渐进展示不丢失权威数据

TUI SHALL 使用摘要、折叠和受限 viewport 控制视觉密度，但 MUST NOT 因默认展示限制
而从 canonical UI projection、Session、Runtime transcript、Agent Activity projection
或 Process Store 删除完整内容。摘要 formatter MUST NOT 覆盖 lossless Tool result。

#### Scenario: 长用户输入保持 Chat 紧凑
- **WHEN** 用户提交超过 1000 字符或 10 行的文本
- **THEN** Chat 仅显示首行摘要、字符数和行数
- **AND** canonical UIMessage、模型输入与 Session 中保留完整文本
- **AND** live 提交与 Session replay 使用相同摘要规则

#### Scenario: Tool history 已折叠
- **WHEN** completed Execution 的 Tools 折叠
- **THEN** TUI 显示 Tool 总数与成功/失败统计
- **AND** Inspector 展开后仍可访问已投影的 Tool timeline

#### Scenario: Main Tool 长结果
- **WHEN** Main read_file result 超过默认可见行预算
- **THEN** Chat 只显示不含换行的行数/字符数摘要
- **AND** Inspector output viewport 可分页访问完整 result
- **AND** 可见行预算不改变 canonical Tool result

#### Scenario: SubAgent 长结果
- **WHEN** SubAgent output 超过 Card 的可见详情预算
- **THEN** Card 显示受限详情与 Inspector 入口
- **AND** Agent Process Store 中的完整 output 保持不变

#### Scenario: SubAgent Tool 长结果
- **WHEN** SubAgent Tool result 超过 Inspector 的单页预算
- **THEN** Inspector 只渲染当前行窗口
- **AND** 通过 toolCallId 从 inline detail 或 Agent Process result reference 继续分页

#### Scenario: 历史记录没有 Tool timeline
- **WHEN** 加载旧 Session 的 Agent Activity 且记录不含 Tool Activity
- **THEN** TUI 恢复 Agent task、状态与 result
- **AND** 不伪造 Tool timeline

#### Scenario: 历史 Tool 只有摘要
- **WHEN** legacy Tool Activity 没有 lossless result 或 result reference
- **THEN** Inspector 显示现有摘要与 unavailable 状态
- **AND** 不把摘要声明为完整 output

### Requirement: TUI keeps planning under Agent control
The TUI SHALL keep a single Chat input and SHALL NOT expose an `Auto / Plan`
mode, dedicated Plan panel, Plan page, or Plan/Execution hierarchy.

#### Scenario: User submits a request
- **WHEN** the user sends a Chat message
- **THEN** Main Agent autonomously chooses direct execution or internal planning

#### Scenario: Internal planning progresses
- **WHEN** the Planner investigates, selects a technical path, backtracks, or replans
- **THEN** existing Turn, Execution, and Tool views continue normally without a separate Plan surface

### Requirement: TUI renders one global Plan output inline
After internal authorization, the TUI SHALL derive one user-readable global Plan
output from the persisted PlanRecord, render it before TODO, and keep it collapsed
by default without introducing a dedicated Plan panel.

#### Scenario: Authorized Plan appears
- **WHEN** Planner authorizes executable items
- **THEN** the conversation shows a collapsed Plan row with title and status before the live TODO without presenting PlanExecutionStep count as task count

#### Scenario: User expands the Plan
- **WHEN** the Plan row has focus and the user presses Enter
- **THEN** it reveals goal, committed constraints, selected approach, scope, ordered steps, and verification while hiding internal Plan metadata

#### Scenario: Session restores or Plan is revised
- **WHEN** TUI restores an authorized Plan or receives a newly authorized revision
- **THEN** it restores or replaces the single Plan output in collapsed state without duplicating it

### Requirement: TUI projects TODO from Main TaskState
The TUI SHALL render at most one current TODO list from the selected Session's
Main Agent TaskState. It MUST NOT derive TodoItems or statuses from Plan steps,
verification, Tool rows, Execution nodes, AgentProcess state, or continuation
budget.

#### Scenario: Planned work initializes TaskState
- **WHEN** Main initializes TaskState after Plan authorization
- **THEN** TUI renders the outcome-oriented TodoItems after the collapsed Plan row

#### Scenario: Direct work initializes TaskState
- **WHEN** a Direct request creates TaskState without a PlanRecord
- **THEN** TUI renders TODO without an empty or synthetic Plan row

#### Scenario: TaskState advances
- **WHEN** TUI receives a newer `task_state` snapshot
- **THEN** it updates the existing TODO in place and ignores older TaskState versions

#### Scenario: Automatic continuation stops
- **WHEN** Runtime exhausts its continuation budget
- **THEN** TUI preserves the current in-progress TodoItem and does not display it as blocked unless TaskState contains a structured external blocker

#### Scenario: Session changes
- **WHEN** TUI switches Sessions or reconnects
- **THEN** it clears the prior TODO and restores only the selected Session's retained TaskState

### Requirement: TUI renders intent alignment inline
Pending user-value decisions SHALL appear in the conversation area as an inline
Chat interaction, not as a bottom Plan panel or Tool row.

#### Scenario: Alignment is pending
- **WHEN** the Agent cannot infer a visual, scope, or compatibility preference
- **THEN** TUI shows the one persisted pending requirement as a concise question, exactly one recommendation, at most three options, and a custom-text path

#### Scenario: User chooses by keyboard
- **WHEN** the inline interaction has focus
- **THEN** arrow keys move selection, Enter confirms, and Esc returns to Chat without approving an entire Plan

### Requirement: TUI restores pending Chat alignment
The TUI SHALL reconstruct the current inline alignment after startup, reconnect,
and Session switch while keeping internal Plan state hidden.

#### Scenario: Pending alignment is restored
- **WHEN** TUI attaches to a Session with a persisted unresolved interaction
- **THEN** that interaction appears once in the conversation area with the current options

#### Scenario: No alignment is pending
- **WHEN** TUI attaches to a Session whose Agent can continue autonomously
- **THEN** no stale planning or alignment UI from the previous Session remains

### Requirement: TUI separates execution narration from final reporting
The TUI SHALL hide intermediate assistant narration produced during automatic
Plan execution and SHALL render one visible final report after a completed
Plan. The report SHALL cover delivered results, verification actually run and
its conclusions, and anything unverified or still missing.

#### Scenario: Main narrates internal execution
- **WHEN** an execution-phase assistant message contains no user-facing final report
- **THEN** TUI excludes it from live conversation and Session replay

#### Scenario: Completed Plan enters report phase
- **WHEN** Plan bindings are cleared but the owning Main remains alive
- **THEN** TUI continues processing TaskState updates and then renders exactly one final report

#### Scenario: Plan is cancelled or failed
- **WHEN** terminal cleanup terminates Main
- **THEN** TUI does not fabricate the completed-report flow

### Requirement: Existing permission interaction remains authoritative
The TUI SHALL continue to use the existing permission flow for protected side
effects and SHALL NOT add whole-Plan approval.

#### Scenario: Execution reaches a protected tool
- **WHEN** Harness policy requires user permission
- **THEN** the existing permission interaction is shown with its current keyboard behavior

### Requirement: TUI projects authoritative execution episode state
The TUI SHALL display running, reflecting, paused-inconclusive, and completed episode
states in the conversation hierarchy from HarnessAPI and HarnessEventBus snapshots.
It MUST NOT infer episode phase from spinner state, elapsed time, or absence of output.

#### Scenario: Episode runs tools
- **WHEN** the authoritative episode is running
- **THEN** the TUI shows the episode state above subordinate execution and Tool details

#### Scenario: Reflection starts
- **WHEN** the Host begins the one allowed reflection
- **THEN** the TUI changes the episode label to reflecting while retaining the current Plan and TODO projection

#### Scenario: Episode pauses
- **WHEN** the authoritative phase becomes `paused_inconclusive`
- **THEN** the TUI stops active processing indicators, labels unfinished outcomes unverified, and retains expandable execution details

#### Scenario: Episode completes
- **WHEN** the authoritative phase becomes `completed`
- **THEN** the TUI renders completion without leaving a running Tool or processing indicator

### Requirement: TUI provides keyboard recovery from inconclusive pause
The TUI SHALL expose keyboard-operable Adjust Plan and Continue Execution actions for
the current paused snapshot. It SHALL submit typed recovery commands and render
conflicts from the returned authoritative state.

#### Scenario: User continues execution
- **WHEN** the user activates Continue Execution from a paused episode
- **THEN** the TUI starts a new bounded episode only after HarnessAPI accepts the command

#### Scenario: User adjusts the Plan
- **WHEN** the user activates Adjust Plan from a paused episode
- **THEN** the TUI returns foreground interaction to planning with the saved incident context

#### Scenario: Terminal width is constrained
- **WHEN** the paused state renders in a narrow terminal
- **THEN** labels, reason, progress, and recovery actions wrap without hiding their semantic distinction

