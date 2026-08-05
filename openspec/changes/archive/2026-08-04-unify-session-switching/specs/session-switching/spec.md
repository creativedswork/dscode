## ADDED Requirements

### Requirement: 统一 Session 切换入口

系统 SHALL 提供一个 UI 无关、可等待的 Session 切换入口。TUI slash command、
Web slash command 和 Web 侧边栏加载 MUST 使用该入口，不得各自直接编排
SessionManager 和 AgentSupervisor。

#### Scenario: 三种入口行为一致
- **WHEN** 用户分别通过三个入口加载同一个 Session
- **THEN** 系统执行相同的目标解析、中止、保存、加载、Main Process 重绑定和完成通知顺序

### Requirement: 切换前目标预检

系统 MUST 在中止当前 turn 或修改当前 Session 前解析唯一目标，并完成目标 Session
的读取、格式校验和资源恢复。

#### Scenario: 目标不存在
- **WHEN** 用户加载不存在的 Session ID
- **THEN** 系统返回 Session not found，且当前 turn、Session 和 Main Process 归属均不改变

#### Scenario: 前缀不唯一
- **WHEN** Session ID 前缀匹配多个 Session
- **THEN** 系统返回候选冲突，且不执行 abort 或 save

### Requirement: 切换事务顺序

目标预检成功后，系统 SHALL 依次中止并等待当前 Main turn 静止、保存原 Session、
持久化 Main Process 重绑定、提交目标 Session。UI MUST 仅在所有步骤完成后收到
成功结果。

#### Scenario: 正常切换
- **WHEN** Session A 正常切换到 Session B
- **THEN** A 在 B commit 前完整保存，Main Process 持久化关联 B，随后 B 成为当前 Session

#### Scenario: 重绑定失败
- **WHEN** Main Process 的新 parentSessionId 无法持久化
- **THEN** 系统保持 Session A 为当前 Session，恢复 Main Process 的旧归属并返回错误

### Requirement: Session 切换互斥

系统 MUST 防止两个 Session 切换事务或新的 Main prompt 与正在执行的切换交错。
已运行的 background SubAgent MAY 继续完成。

#### Scenario: 重复切换
- **WHEN** 一个 Session 切换尚未完成时收到第二个切换请求
- **THEN** 第二个请求被明确拒绝或排队，且两个事务的状态不得交错

#### Scenario: 切换期间提交 prompt
- **WHEN** Session 切换尚未完成时收到新用户 prompt
- **THEN** prompt 不得进入源 Session 或目标 Session 的消息历史

### Requirement: Slash command 异步完成

slash command 执行协议 SHALL 返回可等待结果。TUI 与 Web MUST await
`/session load` 完成后再清除 conversation、刷新 Session 列表、隐藏 loader 或发送
ready。

#### Scenario: Web slash load
- **WHEN** Web 用户执行 `/session load <id>`
- **THEN** Web 在切换事务完成后只发送一次目标 Session 的 ready 和 conversation history

#### Scenario: TUI slash load
- **WHEN** TUI 用户执行 `/session load <id>`
- **THEN** TUI 在切换事务完成后重放目标消息，且不会提前显示加载成功

### Requirement: 跨 Session SubAgent 路由

Session 切换 SHALL 只重绑定 Main Agent Process。已存在 SubAgent 的
`parentSessionId` MUST 保持不变。

#### Scenario: 旧后台 Agent 在切换后退出
- **WHEN** Session A 启动 background Agent X 后 Main Agent 切换到 Session B，随后 X 完成
- **THEN** X 的退出记录写入 A，B 不接收 X 的 agentMessages 或 pending notification

### Requirement: Session load 不创建 Agent

Session load SHALL 只恢复持久化历史和重绑定 Main Agent Process。加载流程 MUST
NOT 调用 spawn 或创建新的 SubAgent Process。

#### Scenario: 加载带 SubAgent 历史的 Session
- **WHEN** 用户加载包含 agentMessages 的历史 Session
- **THEN** 系统恢复关联记录但不重新运行、恢复或创建这些 SubAgent

#### Scenario: 加载完成
- **WHEN** `/session load` 成功完成且没有其他独立任务调用
- **THEN** Agent Process Table 不因 load 操作新增进程

### Requirement: 权限提示保存

入口存在 active permission prompt 时，UI adapter SHALL 先形成结构化
PendingPermission，并由统一切换事务保存到源 Session。核心切换逻辑 MUST NOT
依赖 Web UI 私有状态。

#### Scenario: 权限提示期间切换
- **WHEN** Web 在工具权限提示期间加载另一个 Session
- **THEN** 源 Session 保存 PendingPermission 和清理后的 Main 消息，目标 Session 正常加载
