## ADDED Requirements

### Requirement: Session 预加载与提交分离

SessionManager SHALL 支持在不修改当前状态的情况下预加载目标 Session。预加载
MUST 完成 JSON 校验、metadata 校验、Main 消息读取、`agentMessages` 迁移和图片
资源恢复；提交操作 MUST 不执行文件 I/O。

#### Scenario: 预加载成功
- **WHEN** 系统预加载合法的目标 Session
- **THEN** 返回固定 prepared snapshot，当前 Session 和 Main Agent messages 保持不变

#### Scenario: 预加载失败
- **WHEN** 目标 Session 损坏或图片恢复过程发生不可恢复错误
- **THEN** 返回错误且不修改当前 Session、messages 或 agentMessages

### Requirement: 提交恢复 Main 与 Agent 记录

提交 prepared snapshot 时，SessionManager SHALL 将 snapshot 的 Main 消息赋给
Main PiAgentRuntime，并独立恢复 `agentMessages`。SubAgent transcript MUST NOT
追加到 Main Agent messages。

#### Scenario: 加载带 SubAgent 的 Session
- **WHEN** 目标 Session 包含 Main messages 和三个 agentMessages
- **THEN** Main PiAgentRuntime 只恢复 Main messages，SessionManager 恢复三个 agentMessages

#### Scenario: 加载旧 Vision Session
- **WHEN** 目标是包含 legacy visionMessages 的版本 2 Session
- **THEN** 预加载将其转换为内存 AgentSessionMessage，提交后仍不污染 Main messages

### Requirement: 原 Session 在提交前持久化

统一切换事务 SHALL 在目标 Session commit 前保存源 Session 的 Main messages、
metadata、`agentMessages` 和可选 PendingPermission。

#### Scenario: 源 Session 有未保存消息
- **WHEN** Session A 存在未保存 Main 消息并切换到 B
- **THEN** A 的磁盘记录在 B commit 前包含该消息

#### Scenario: 后台 Agent 已更新源 Session
- **WHEN** background Agent 在切换准备期间完成并写入 Session A
- **THEN** A 保存后的 agentMessages 保留该 Agent 记录

### Requirement: Session load 事件是完成通知

`session:loaded` SHALL 在 prepared snapshot commit 后发出，作为状态已经切换的通知。
关键 Process 重绑定 MUST NOT 依赖未等待的事件 handler。

#### Scenario: 观察加载事件
- **WHEN** 监听器收到目标 Session B 的 session:loaded
- **THEN** SessionManager.current、Main messages、agentMessages 和 Main Process parentSessionId 均已指向 B
