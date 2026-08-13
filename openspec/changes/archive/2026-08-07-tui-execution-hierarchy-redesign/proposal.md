## Why

TUI 当前把 Main thinking、Main Tool、`spawn_agent`、SubAgent Activity、SubAgent
Tool、Permission 和全局 Waiting 状态堆在同一个扁平日志流中。执行归属不清会造成
重复信息、卡片外 Tool、长内容挤满视口以及用户无法判断“谁正在做什么”；近期并行
SubAgent 和 Tool progress 能力进一步放大了这个问题。

## What Changes

- 将 TUI 对话展示重构为 `Turn → Execution → Tool` 执行树：Main execution 是根，
  SubAgent Activity 是其 Delegation 子执行容器。
- 为 Tool lifecycle、Agent progress 和 Permission prompt 增加稳定的执行归属信息，
  至少包含 `executionId` 与 `toolCallId`，使 Main Tool 与 SubAgent Tool 可确定性分流。
- `spawn_agent` 不再同时显示为普通 Main Tool 行和 SubAgent Card；Activity Card
  成为该委派执行的唯一可见表示。
- Thinking 和 Tools 支持独立折叠；运行、授权、完成、失败状态采用不同默认展开策略，
  并保留键盘可访问状态。
- Permission 在所属 Tool 内原位展示，完成后折叠为 Tool 状态，不再生成永久
  `Permission: allowed` 对话消息。
- 全局 Waiting 仅在没有更具体执行活动时显示；存在活动时状态栏展示最具体的
  Agent/Tool 状态。
- 完整 Thinking、Tool 参数/结果和 SubAgent output 继续保留在权威数据源中；UI
  通过摘要、折叠和限高详情渐进展示，不以视觉裁剪替代数据保存。
- Session 历史恢复使用相同执行树语义，且不 spawn、resume 或重新执行进程。

## Capabilities

### New Capabilities

- `tui-execution-hierarchy`: 定义 TUI Turn/Execution/Tool 层级、折叠策略、状态驱动
  展示、渐进披露和无信息丢失边界。

### Modified Capabilities

- `agent-activity-display`: Agent Activity 从独立摘要块扩展为拥有 Tool timeline、
  Permission 和 result 的 SubAgent execution container。
- `agent-progress-notification`: 生命周期和 Tool progress 事件增加 execution/tool
  identity，支持确定性归属和原位更新。
- `shared-conversation-model`: canonical UI 模型增加 Execution 与 Tool Activity
  结构，并支持按 identity upsert，而不是仅依赖扁平 assistant/agent 消息。

## Impact

- 主要影响 `src/core/events.ts`、Agent runtime/lifecycle、Permission prompt 回调、
  `src/ui/shared/` 投影类型、`src/ui/tui-backend.ts`、`src/ui/conversation.ts` 和
  `src/ui/tui-app.ts`。
- TUI 组件从字符串 block 演进为带状态的 Turn/Execution renderer；Web 继续使用
  现有 Agent Card，但可复用新增 canonical execution/tool identity。
- Session 与 Agent Process Store 的权威 transcript/output 不删除、不截断；仅增加
  可兼容的展示投影字段。
- 不引入新的运行时依赖，不改变 Agent 的模型上下文隔离、Process Store 所有权或
  foreground/background 执行语义。
