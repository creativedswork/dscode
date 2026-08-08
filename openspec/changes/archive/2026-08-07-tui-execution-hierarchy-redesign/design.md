## Context

dscode 已有三条相关链路，但它们没有形成一致的信息架构：

1. Main Runtime 通过 `llm:*`、`tool:*` 和 `processing:*` 事件直接驱动 TUI live text；
2. SubAgent Runtime 仅把 state/progress/output 投影成 `AgentActivity`；
3. Permission prompt 是独立的 Conversation live component，批准后追加永久 info text。

因此 Tool 的执行归属在 UI 层丢失：Main 的 `spawn_agent` Tool 与 SubAgent Activity
重复，SubAgent 内部 Tool 只剩一条 progress message，Permission 无法绑定到具体
execution，TUI 只能把它们按到达时间堆在一起。

完整 Main transcript 由 Session 保存，完整 SubAgent transcript/output 由
AgentProcessStore 保存。新的执行树必须是 display-only projection，不能改变模型上下文
或把子进程 transcript 拼入父 Agent messages。

## Goals / Non-Goals

**Goals:**

- 建立 canonical `Turn → Execution → Tool` 展示层级。
- 让每条 SubAgent Tool lifecycle 拥有稳定 `executionId`、`toolCallId` 和状态。
- 将 SubAgent Tool timeline、Permission 和 result 原位显示在 Agent Card 内。
- Thinking 与 Tools 独立折叠，并按 running/permission/completed/failed 自动选择默认值。
- 保留完整权威数据，使用摘要、折叠和限高详情控制视觉密度。
- 保持 Session 路由、Agent Process 隔离和历史恢复兼容。

**Non-Goals:**

- 不把完整 SubAgent token stream 或 transcript 嵌入 Main conversation。
- 不在本 change 中重做 Web AgentActivityCard 视觉。
- 不增加鼠标依赖；TUI 折叠必须可由键盘操作。
- 不改变 `spawn_agent` 的模型可见输入或 foreground/background 语义。
- 不引入新的磁盘格式版本或运行时依赖。

## Decisions

### 1. 以 AgentActivity 作为 SubAgent Execution projection

共享 UI 层新增：

```typescript
interface AgentToolActivity {
  toolCallId: string;
  name: string;
  status: "running" | "permission" | "completed" | "failed";
  summary?: string;
  startedAt: number;
  endedAt?: number;
  isError?: boolean;
}

interface AgentActivity {
  // existing fields
  executionId: string; // equals agentId for the current one-process execution model
  tools?: AgentToolActivity[];
  permission?: {
    toolCallId?: string;
    toolName: string;
    preview: string;
  };
}
```

`PiAgentRuntimeAdapter` 在 `tool_execution_start/end` 时通过现有 `onProgress` 发布结构化
details。`AgentActivityProjector` 按 `agentId + toolCallId` 维护 Tool timeline，并把
snapshot 发布给 TUI/Web。

**替代方案：** 新建独立 `agent:tool` Event。该方案类型更纯，但会扩展 Harness event
surface、backend 订阅和测试矩阵；现有 `agent:progress` 已承担 SubAgent 结构化进度，
因此本 change 在其 details 中增加判别字段。

### 2. Permission 使用 execution-scoped UI 事件

SubAgent PermissionManager 的 prompt callback 已位于 `createSubagentRuntime` 的
agentId 闭包内。进入 prompt 前发布 phase=`permission` 的 Agent progress，并携带
toolCallId/toolName/preview；完成后发布 resolution。Projector 优先按 toolCallId 将
Permission 绑定到同 Agent 的具体 Tool；兼容旧事件时才回退到同名的当前 running
Tool。若没有匹配 Tool，仍保留 execution-level Permission，禁止丢弃审批请求。

Main Permission 继续使用现有 inline prompt，但批准/拒绝后不再追加永久
`Permission: ...` info block。SubAgent Permission 由 Agent Card 内原位 prompt
表达，Harness 级 queue 继续保证同一时间只有一个可交互审批。

**替代方案：** 只按同名 active Tool 匹配。该方案在并行同名 Tool 中存在歧义，因此
当前实现从 PermissionManager 的 tool call context 传递精确 toolCallId，仅为旧事件
保留 active Tool 回退。

### 3. TUI 使用状态化 Component，而不是预格式化字符串

`ContentBlock.agent` 保存 `AgentActivity` snapshot，不再只保存 ANSI 字符串。
`TuiAgentActivityCard` 负责：

- Header、task、Tool summary、Tool details、Permission、result 和 footer；
- 根据 terminal width 做 ANSI-aware wrap；
- 根据 UI disclosure state 渲染 Thinking/Tools；
- 终态完整结果使用受限行数的 viewport，完整值仍留在 Activity/Process Store。

ConversationView 按 agentId 保存 card state，并在 Activity upsert 时保留用户手动展开
选择。Running/permission/failed 默认展开 Tools，completed 默认折叠；Permission
存在时禁止收起 Tools。

**替代方案：** 继续生成字符串后交给 `Text`。该方式不能表达独立 disclosure state，
也无法在不重建全部 static blocks 的情况下可靠更新层级，因此不采用。

### 4. `spawn_agent` 是 Delegation，不重复显示为普通 Tool

Main live Tool 列表仍接收 `spawn_agent` lifecycle 以保证模型执行不变，但 TUI renderer
不创建普通 Tool row；相应 AgentActivity Card 是唯一的可见委派记录。若 spawn 在创建
Process 前失败，则回退显示一条 failed `spawn_agent` Tool row，避免错误消失。

普通 Main Tool 继续显示在 Main execution 下，SubAgent Tool 只显示在自己的 Card 中。

### 5. 折叠状态与执行状态分离

折叠是纯 UI state，不写入 Session 或模型 transcript：

| Execution state | Thinking default | Tools default |
|---|---:|---:|
| running | collapsed | expanded |
| permission | collapsed | expanded + locked |
| completed | collapsed | collapsed |
| failed/terminated/killed | collapsed | expanded |

用户可覆盖默认值；状态转换只在第一次进入对应状态时应用，避免 progress snapshot
不断重置用户选择。即使 Tools 收起，card summary 和底部 status line 仍显示当前活动。

### 6. 完整数据与视觉密度分离

不在 projection 层截断权威字段。折叠态显示摘要；展开态对超长 result 使用固定最大行数
并显示“完整内容位于 Agent Process Store”。Tool history 超过可见预算时显示最近活动与
总数，后续可增加独立 pager，但本 change 不删除 timeline 数据。

## Risks / Trade-offs

- **[旧 Permission 事件缺少 toolCallId]** → 新事件使用精确 identity；旧事件回退匹配
  同名 active Tool，并始终保留 execution-level prompt，避免审批请求消失。
- **[Activity snapshot 变大]** → 只携带 Tool 元数据/摘要，不复制完整 Tool result；
  完整 result 仍在 Runtime transcript 和 Process Store。
- **[TUI static block 重建造成闪烁]** → Card state 与 Activity snapshot 分离，
  按 agentId 替换 Component，使用现有 differential renderer。
- **[隐藏 spawn_agent 后错误不可见]** → 仅在 Agent Process 已创建时抑制普通 row；
  pre-spawn validation/runtime factory 错误仍显示 failed Tool。
- **[历史 Session 无 Tool timeline]** → 旧记录仍恢复 Agent header/task/result，
  Tools summary 显示 unavailable，不伪造历史明细。

## Migration Plan

1. 扩展 shared types 和 projector，保持新增字段可选。
2. 让 Runtime/Permission 路径产生结构化 progress。
3. 切换 TUI Card renderer 与 `spawn_agent` 去重。
4. 增加键盘折叠和状态驱动默认值。
5. 用旧 Session fixture、并行 SubAgent 和 Permission 场景回归。

回滚时可停止消费新增 optional fields并恢复旧 formatter；Agent runtime、Session 和
Process Store 数据仍兼容，无需迁移磁盘内容。

## Open Questions

- Tool timeline 的交互式分页可在真实长任务数据出现后单独设计；本 change 先保证数据
  不丢失并通过折叠控制默认密度。
