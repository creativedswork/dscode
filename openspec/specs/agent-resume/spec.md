## ADDED Requirements

### Requirement: 中断恢复入口
系统 SHALL 提供 `resumeAgentBackground()` 函数，支持从侧链转录恢复被中断或后台化的代理。

恢复流程 MUST：
1. 从 `getAgentTranscript(agentId)` 读取侧链转录
2. 从 `readAgentMetadata(agentId)` 读取代理元数据
3. 重建消息列表（过滤空白消息、孤立思考消息、未解决的 tool_use）
4. 重建内容替换状态（`reconstructForSubagentResume`）
5. 将新 prompt 作为 user 消息追加
6. 调用 `runAgent()` 继续执行

#### Scenario: SendMessage 恢复
- **WHEN** 主 Agent 通过 `SendMessage({to: "explorer-1", content: "再查查测试文件"})` 恢复后台代理
- **THEN** `resumeAgentBackground()` 加载历史转录，追加新 prompt，继续执行

### Requirement: 转录过滤
恢复时 SHALL 对侧链转录进行过滤：
- 移除仅包含空白内容的 assistant 消息
- 移除孤立思维消息（无后续 tool_use 的 thinking 内容）
- 移除未解决的 tool_use 块（无对应 tool_result）

#### Scenario: 过滤无效消息
- **WHEN** 转录中包含一条仅含 thinking 的 assistant 消息
- **THEN** 该消息在恢复时被过滤掉

### Requirement: 状态重建
系统 SHALL 在恢复时重建以下状态：
- 文件读取缓存（`cloneFileStateCache`）
- 内容替换状态（`reconstructForSubagentResume`）
- Worktree 路径（如原始代理使用了 worktree 隔离）

#### Scenario: Worktree 恢复
- **WHEN** 原始代理使用 worktree 且 worktree 仍然存在
- **THEN** 恢复的代理在相同 worktree 路径下执行

#### Scenario: Worktree 丢失
- **WHEN** 原始 worktree 已被外部删除
- **THEN** 恢复时代理回退到父代理的 cwd

### Requirement: Fork 代理恢复
恢复 Fork 子代理时 SHALL 使用 `FORK_AGENT` 定义和父代理的系统提示（而非 `FORK_AGENT` 的空系统提示）。

#### Scenario: Fork 恢复
- **WHEN** 恢复一个 Fork 子代理
- **THEN** 使用父代理渲染的系统提示，确保 Prompt Cache 一致性
