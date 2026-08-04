## 变更综述

dscode 的对话展示从 Web/TUI 各自维护状态，逐步演进为共享 UI 模型和独立
Display 层；随后引入“Agent 即进程、Session 即 TTY”的 SubAgent 架构，并统一了
跨 UI 的 Session 切换与 `parentSessionId` 路由。本变更完成这条链路的 UI 闭环：
将 SubAgent 生命周期实时投影为 canonical Agent Activity，并从 `agentMessages`
恢复历史记录，使 Web 与 TUI 都能在对话流中看到同一子进程的启动、进度、终态和
结果，同时继续保持 Main Agent 推理上下文与 SubAgent transcript 隔离。

## 变更时间线

- 2026-05-29: `shared-ui-data-model` — 建立 Web/TUI 共用的 canonical UI 类型、协议和 reducer。
- 2026-05-29: `session-mm-vision-pipeline` — 分离推理数据层与 UI 展示层，引入统一历史重建入口。
- 2026-08-04: `subagent-design-proposal` — 建立 Agent Process、Application、Supervisor 和 Session/TTY 关联模型。
- 2026-08-04: `unify-session-switching` — 统一 Session 切换事务并固定 background Agent 的父 Session 路由。
- 2026-08-04: `show-subagents-in-conversation` — 将 SubAgent 实时与历史执行轨迹展示到 Web/TUI 对话流。

## 初始设计

最早的共享 UI 设计旨在消除 Web 与 TUI 的类型和状态漂移：`src/ui/shared/`
成为 conversation、permission、config 和 wire protocol 的单一数据源，
`conversationReducer` 负责把服务端事件归一化为 UI 状态。

随后，多模态 Session 设计明确区分两个边界：

- `agent.state.messages` 保存模型实际接收的 Main Agent 推理上下文；
- `rebuildDisplayMessages()` 从独立持久化记录恢复 display-ready conversation。

这两个决定为 Agent Activity 提供了基础：新增展示记录不需要伪装成 assistant
消息，也不能回写 Main Agent 推理上下文。

## 变更记录

### 变更: 引入同构 Agent Process
- **触发**: 单一 Main Agent 无法把复杂任务拆成独立、可管理、可并发的执行单元。
- **改动**: 引入 AgentApplication、AgentSupervisor、通用 PiAgentRuntimeAdapter、
  生命周期事件和 foreground/background attachment。
- **影响**: SubAgent 成为独立 Process，通过 `parentSessionId` 连接父 Session，
  完整 transcript 留在 Process Store，Session 仅保存轻量 `agentMessages`。

### 变更: 统一 Session 切换与路由
- **触发**: TUI、Web slash 和 Web sidebar 分别编排 Session load，可能错误重绑定
  Main Process 或把 background Agent 结果写入当前错误 Session。
- **改动**: 使用统一两阶段 Session 切换；Main Process 原子重绑定，既有子进程保持
  启动时的 `parentSessionId`。
- **影响**: Agent Activity 可以使用显式父 Session 过滤实时事件，并在未来加载原
  Session 时从 `agentMessages` 恢复。

### 变更: Agent Activity 进入共享对话投影
- **触发**: 运行时已有完整 Agent 生命周期，但 UI 只在 background exit 时显示短暂 toast。
- **改动**: 新增 canonical `AgentActivity`、`role: "agent"` 和
  `agent_activity` snapshot；Web/TUI 共用 projector，按 `agentId` 原位更新。
- **影响**: 前端不再聚合五类内部生命周期事件，Process/runtime 内部对象也不会泄漏
  到协议层。

### 变更: 历史重建扩展到通用 Agent
- **触发**: 原 `agentMessages` 只用于恢复 Vision 图片，TUI 不读取通用 Agent 记录。
- **改动**: `rebuildDisplayMessages()` 生成 agent-role display record，并按
  `messageIndex`、时间戳、尾部回退稳定放置；TUI replay 改用同一 display-ready 输入。
- **影响**: Session reload 可恢复 Agent Activity，但不会 spawn、resume 或重新执行
  Agent Process；legacy Vision 记录也通过通用 Agent 卡片显示。

## 修复记录

### 修复: background Agent 仅有完成 toast
- **症状**: 用户看不到 Agent 的启动、waiting、progress、耗时和结果，只能在退出时看到 toast。
- **根因**: UI backend 只订阅 `agent:exit`，共享 conversation model 不支持 Agent role。
- **修复**: Web/TUI 订阅完整生命周期并使用共享 projector；移除 completion-only toast。

### 修复: 跨 Session 实时串流
- **症状**: Session A 的 background Agent 可能在当前展示 Session B 时污染 B 的对话。
- **根因**: UI 通知未以 Process 的显式 `parentSessionId` 为发送边界。
- **修复**: projector 在发布前比较当前 Session，非当前 Session 仅保留持久化终态供未来恢复。

### 修复: TUI 历史缺失 Agent Activity
- **症状**: Web 可通过 display builder 恢复部分记录，TUI replay 只遍历 Main messages。
- **根因**: 双端历史恢复入口不一致。
- **修复**: TUI 在 replay 前调用 `rebuildDisplayMessages()`，并保留 text、thinking、
  tool result 与 image 展示。

### 修复: Web 已发送 Activity 但前端不显示
- **症状**: Web backend 可观察到 `agent_activity` snapshot，但 ChatView 中没有 Agent Card。
- **根因**: `App.tsx` 的 ServerEvent switch 未将 `agent_activity` 交给
  `conversationReducer`。
- **修复**: 将 `agent_activity` 纳入 canonical conversation event 分支，并增加回归测试。

### 修复: Vision 可绕过 SubAgent 与 TUI 展示偏离原型
- **症状**: Main 模型原生支持图片时 Vision 可能不创建 Process；TUI Activity 使用
  `input:/progress:/output:` 标签并展示运行时注入的附件文本。
- **根因**: Vision 兼容直通条件未受 Agent feature flag 约束，spawn 事件复用了增强
  runtime prompt，TUI formatter 未遵循原型的信息层级。
- **修复**: Agents 开启时强制 Vision 经 AgentSupervisor；新增独立 `displayPrompt`；
  TUI 使用状态符号、Application、状态/挂载/耗时、prompt、`↳` 摘要和 Process ID。

## 最终状态

最终交付包含以下行为：

- 共享层定义纯 TypeScript `AgentActivity`，覆盖进程身份、Application、
  attachment、状态、输入、progress、output/error 和时间字段。
- `agent_activity` Web snapshot 由当前 Agent Process 与生命周期事件构建；
  相同非终态 progress 去重，终态始终转发。
- `conversationReducer` 按 `agentId` 不可变 upsert，ready replay 与 clear 支持
  agent-role 消息，不产生重复卡片。
- Web 使用独立 Agent Activity Card 展示状态图标与文本、Application、attachment、
  运行/最终耗时、输入、progress、output/error 摘要；长详情默认折叠，原位展开，
  具备 `aria-expanded` 和受限滚动区域。
- Agent Card 使用 semantic CSS token，并作为独立 `agent-card` collider 参与
  Chat-to-Dashboard transition，不使用 assistant phase label。
- TUI 使用同一数据语义显示紧凑状态块，并按 `agentId` 原位更新；background exit
  不再只显示 toast。
- Session load 从 `agentMessages` 恢复 Activity，保持 legacy Vision、图片、
  thinking 和 tool result 行为，不创建或恢复 Agent Process。
- Main Agent messages、SubAgent transcript、Session v3 和 Process Store 的隔离
  边界保持不变，未新增运行时依赖。
