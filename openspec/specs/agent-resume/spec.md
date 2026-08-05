# agent-resume Specification

## Purpose
TBD - created by archiving change subagent-design-proposal. Update Purpose after archive.
## Requirements
### Requirement: 活进程 IPC

系统 SHALL 支持向实现 messaging capability 且处于 running、waiting 或 stopped 的 Agent 发送消息。PiAgentRuntimeAdapter SHALL 通过 steering 或 follow-up queue 在安全边界注入。

#### Scenario: Steering 消息
- **WHEN** 父进程向正在执行工具的 Agent 发送补充要求
- **THEN** 当前工具完成后，目标 Agent 在下一轮模型调用前接收消息

### Requirement: 进程可见性

只有父进程、祖先进程或具备 managed process-control capability 的调用方 SHALL 能控制 Agent。普通 Agent MUST NOT 向无关进程发送消息或信号。

#### Scenario: 跨会话控制
- **WHEN** Session B 的 Main Agent 尝试 kill Session A 的子进程
- **THEN** 操作被拒绝

### Requirement: 协作式终止

`terminate_agent` SHALL 请求 Agent 在当前安全边界退出。系统 SHALL 保留已完成的消息、工具结果和输出，并 SHALL 将状态转换为 exited 或 failed。

#### Scenario: 工具执行期间终止
- **WHEN** Agent 正在执行可取消工具且收到 terminate
- **THEN** 系统先发送协作式取消并保存已完成结果

### Requirement: 强制终止

`kill_agent` SHALL abort PiAgentRuntime 和可取消工具，并 SHALL 将 Agent 转为 killed 终态。强制终止 MUST 产生 agent:exit。

#### Scenario: Agent 无法协作停止
- **WHEN** terminate 超时后父进程发送 kill
- **THEN** Agent 进入 killed 且 Process Table 不再标记 running

### Requirement: stopped 与 background 正交

`stopped` SHALL 表示暂停执行，`background` SHALL 表示终端挂载方式。系统 MUST NOT 将二者混为同一状态。

#### Scenario: Background stopped
- **WHEN** background Agent 被暂停
- **THEN** state 为 stopped 且 attachment 仍为 background

### Requirement: 暂停与继续

当 AgentProcessRuntime 实现 suspension capability 时，`suspend_agent` SHALL 在当前安全边界将进程切换为 stopped。`continue_agent` SHALL 使用同一 agentId、runtime state 和 attachment 恢复运行。

#### Scenario: 继续前台进程
- **WHEN** stopped foreground Agent 收到 continue
- **THEN** state 返回 running，attachment 仍为 foreground

#### Scenario: Runtime 不支持 STOP
- **WHEN** 对未实现 suspension capability 的 AgentProcessRuntime 调用 suspend_agent
- **THEN** 操作返回 unsupported，进程保持原状态

### Requirement: 退出进程消息

`send_agent_message` MUST 拒绝 exited、failed 和 killed Agent。若调用方希望继续工作，SHALL 启动新 Agent 并显式选择是否携带旧转录摘要。

#### Scenario: 给已退出 Agent 发消息
- **WHEN** Main Agent 向 completed Agent 发送消息
- **THEN** 返回进程已退出错误，不自动重新创建 Agent
