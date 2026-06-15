## ADDED Requirements

### Requirement: 进度追踪器
系统 SHALL 提供 `ProgressTracker` 状态容器，追踪子代理的运行进度。

追踪指标 MUST 包括：
- `toolUseCount`：工具调用次数
- `latestInputTokens`：最新输入 Token 数（API 返回的累积值）
- `cumulativeOutputTokens`：累积输出 Token 数
- `recentActivities`：最近 5 个工具活动（工具名、输入、描述）

#### Scenario: 进度更新
- **WHEN** 子代理收到 assistant 消息，包含 2 个 tool_use 块和 usage 信息
- **THEN** tracker 的 toolUseCount 增加 2，input/output token 更新

### Requirement: 活动描述解析
系统 SHALL 通过 `createActivityDescriptionResolver()` 创建工具活动描述解析器，将工具调用映射为人类可读描述。

#### Scenario: 活动描述
- **WHEN** 子代理调用 `Read({file_path: "/src/auth.ts"})`
- **THEN** 活动描述为 "Reading /src/auth.ts"

### Requirement: 后台通知机制
系统 SHALL 在后台代理完成/失败/被终止时，通过 `enqueueAgentNotification()` 向父代理发送通知。

通知消息格式 SHALL 为：
```xml
<task-notification>
  <task-id>agent-xxx</task-id>
  <status>completed</status>
  <description>重构 utils</description>
  <output>...最终响应...</output>
  <usage>
    <tokens>12345</tokens>
    <tool-uses>42</tool-uses>
    <duration-ms>30000</duration-ms>
  </usage>
</task-notification>
```

#### Scenario: 完成通知
- **WHEN** 后台代理成功完成
- **THEN** 父代理在下个轮次收到包含完整结果摘要的 task-notification 消息

#### Scenario: 失败通知
- **WHEN** 后台代理因错误失败
- **THEN** 父代理收到 status 为 "failed" 的 task-notification，包含错误信息

### Requirement: 进度摘要
系统 SHALL 支持通过 `startAgentSummarization()` 对长时间运行的后台代理生成周期性进度摘要。

#### Scenario: 进度摘要
- **WHEN** 后台代理运行超过阈值且启用摘要功能
- **THEN** 系统定期生成子代理当前进度摘要，更新到任务状态

### Requirement: 输出文件
后台代理的进度和结果 SHALL 可通过 `getTaskOutputPath(taskId)` 返回的输出文件路径查询。

#### Scenario: 轮询进度
- **WHEN** 父代理读取输出文件
- **THEN** 可获取子代理当前已完成的输出内容
