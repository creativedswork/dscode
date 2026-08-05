## Context

dscode 已使用统一 `AgentSupervisor` 管理 Main Agent 与 SubAgent，并通过
HarnessEventBus 发布进程生命周期事件。SubAgent 终态记录以
`AgentSessionMessage` 写入父 Session 的 `agentMessages`，完整 transcript 保存在
Agent Process Store。

当前共享对话模型只接受 `user | assistant | system`，Web 的历史重建仅利用
`agentMessages` 恢复 Vision 图片，TUI replay 完全不读取 `agentMessages`。实时
`agent:exit` 只转成 toast。因此进程层已经可观测，UI 层却没有稳定、可恢复的展示
投影。

约束：

- Main messages 与 SubAgent transcript 必须继续隔离。
- 所有 Application 使用同一个通用 UI 模型，不增加 Vision 专用分支。
- Agent 完成后即使用户切换 Session，记录仍只能显示在其 `parentSessionId`。
- Web 遵循 editorial workshop 设计系统；TUI 使用相同数据语义但允许更紧凑。
- Session v3 和 Agent Process Store 磁盘格式保持兼容。

## Goals / Non-Goals

**Goals:**

- 在 Web 和 TUI 对话流中展示 SubAgent 的启动、运行、等待和终态。
- 实时事件与 Session 重载后历史使用同一个 canonical `AgentActivity` 投影。
- 默认提供低噪声摘要，并允许 Web 展开完整输出或错误。
- 保证同一 `agentId` 的增量更新不会产生重复卡片。
- 保证跨 Session background Agent 只更新其父 Session。

**Non-Goals:**

- 不在本变更中新增 Agent Process 管理面板。
- 不展示完整逐 token SubAgent transcript。
- 不允许用户从卡片直接 stop、kill、resume 或 send message。
- 不改变 SubAgent spawn、Process Store 或 Session v3 持久化格式。
- 不把 Agent Activity 转换为模型输入或普通 assistant 消息。

## Decisions

### 1. Agent Activity 是共享对话投影

共享 UI 模型新增通用结构：

```typescript
interface AgentActivity {
  agentId: string;
  parentAgentId?: string;
  parentSessionId: string;
  application: string;
  attachment: "foreground" | "background";
  state: AgentProcessState;
  input: string;
  output?: string;
  error?: string;
  progress?: {
    phase?: string;
    current?: number;
    total?: number;
    message?: string;
  };
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}
```

`UIMessage` 支持 `role: "agent"` 和 `agentActivity`。该对象是展示快照，不复用
`AgentProcess` 本体，避免把 runtime、capability 和内部 context 泄漏到协议层。

**替代方案：** 把 SubAgent output 伪装为 assistant message。该方式会模糊 Main 与
子进程边界，也容易被误拼回推理上下文，因此不采用。

### 2. Web 协议发送归一化 snapshot

Web backend 监听现有 Harness Agent 事件，通过 `AgentSupervisor.get(agentId)` 读取
当前 Process，并发送单一 `agent_activity` ServerEvent。每次事件携带完整 UI
snapshot，而不是让前端拼接五种后端事件。

`conversationReducer` 以 `agentId` upsert：

- 首次 `spawned` 追加 `role: "agent"`；
- `state/progress/output` 更新原记录；
- `exit` 写入终态、耗时、output/error 并停止 live indicator。

事件仅在 Process 的 `parentSessionId` 等于当前可见 Session 时广播。其他 Session
依赖已持久化的 `agentMessages`，在未来 load 时恢复。

**替代方案：** 将全部 HarnessEvent 原样加入 Web wire protocol。该方案会让 Web
复制 Supervisor 状态聚合逻辑，并使 TUI 与 Web 行为漂移，因此不采用。

### 3. 历史重建与实时投影同构

`rebuildDisplayMessages()` 将 Main messages 和 `agentMessages` 转换为统一
`ConversationMessage[]`：

- 有 `messageIndex` 时，Agent Activity 插入关联 Main message 后；
- 没有 `messageIndex` 且 Main message 有时间戳时，按 `createdAt` 稳定合并；
- 缺少可比时间时，追加到 Main history 尾部；
- legacy `visionMessages` 先按既有逻辑迁移为 `agentMessages`。

TUI replay 接受同一 display-ready messages，而不是继续直接遍历原始 Main
messages。图片、thinking 和 tool result 的既有重建逻辑保持不变。

### 4. 内联卡片表达“执行记录”而非“说话者”

Web 卡片位于对话流中，使用与 ToolCard 一致的平面卡片语法：

- Header：状态点、Application 名、foreground/background、耗时；
- Summary：输入 prompt 单行截断；
- Body：progress 或终态 output/error 摘要；
- Details：终态后可展开完整 output/error，默认折叠；
- 状态：running/waiting 使用 activity indicator；completed 使用 success token；
  failed/terminated/killed 使用 error 或 muted token。

卡片不显示为 user/assistant bubble，不使用硬编码颜色，不自动展开长输出。

TUI 显示紧凑状态块：Application、状态、耗时、输入摘要和终态输出摘要。完整输出
继续以 Agent Process Store 为权威来源，本变更不增加 TUI 交互面板。

### 5. Agent Activity 不改变模型或持久化边界

`AgentSessionMessage` 仍是 Session 中的轻量关联记录。UI projection 只在 backend
和 shared UI 层生成，禁止写入 `agent.state.messages`。Session load 不 spawn、不
恢复 Process；历史卡片只代表已持久化事实。

## Risks / Trade-offs

- **[实时卡片与终态持久化短暂不同步]** → reducer 以 agentId upsert，终态事件后
  Session 保存使用相同 exit 数据；重新加载以后以磁盘记录为准。
- **[缺少 messageIndex 导致历史位置不精确]** → 优先使用 timestamp 稳定合并，
  无法定位时追加尾部；后续可单独增强 spawn 与 Main message 的因果关联。
- **[长 output 增加 ready payload]** → 默认摘要限制长度，完整 output 只保留
  `AgentSessionMessage.output.text` 已有内容，Web 展开区域设置高度与滚动防线。
- **[高频 progress 触发过多渲染]** → backend 发送 snapshot 时按 agentId/phase
  去重，Web reducer 只替换目标记录。
- **[ToolCard 与 Agent Card 信息重复]** → ToolCard 表示 Main Agent 的 spawn 工具
  调用，Agent Card 表示子进程生命周期；视觉层级和字段不同。
- **[跨 Session 错误广播]** → 每次 projection 都检查显式 `parentSessionId`，
  不使用 UI 当前 Main Process 归属推断。
