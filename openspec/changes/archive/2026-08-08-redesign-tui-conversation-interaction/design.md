## Context

上一轮 TUI execution hierarchy change 已解决 Tool owner、SubAgent Card 和 Permission
归属，但交互仍建立在 `ConversationView` 的第二套 mutable state 上：

- Main Thinking、Main Tool 和历史消息分别进入 `thinkingBuffer`、`toolEntries` 和
  `ContentBlock[]`，没有统一的 stable identity。
- `Ctrl+R` 操作“最后一个 Thinking”，`Ctrl+O` 操作“当前 selected Agent”，
  `Ctrl+N` 再切换 Agent；屏幕没有明确焦点，运行中新增 Activity 后操作目标不直观。
- Web 使用 canonical `UIMessage[] + conversationReducer`，TUI 则直接订阅 Harness
  Event 并维护另一套状态和 replay 逻辑，行为持续漂移。
- Tool result 先被 shared formatter 限制为 2000 字符，TUI 行摘要再限制为 120 字符；
  SubAgent Tool projection 甚至只保留 args summary 和状态，Inspector 无法读取结果。
- Permission 选项显示在 owner Card 内，但键盘状态仍由 `TuiApp` 全局字段维护，缺少
  显式 focus lifecycle。

本 change 保留现有 `@earendil-works/pi-tui` 和 Turn → Execution → Tool 信息架构，
不进行 TUI 框架迁移。

## Goals / Non-Goals

**Goals:**

- 以单一 `Ctrl+E` 入口提供可见、稳定、owner-aware 的 Activity Inspector。
- 运行中默认选中最具体活动，后续 Activity 更新不抢占用户已有 selection。
- 以 `Tab` / `Shift+Tab` 为主要导航，`Enter` 为统一 activate 操作。
- 让 Main/SubAgent Thinking、Tool、Permission 和 result 使用同一套 canonical identity。
- 完整 Tool result 可通过固定高度 viewport 分页查看，不再被 UI formatter 永久截断。
- TUI 与 Web 共用 conversation/execution projection 和 reducer 语义。

**Non-Goals:**

- 不在本 change 中迁移到 OpenTUI、React TUI 或 alternate screen。
- 不改变 WebUI 的视觉布局、鼠标交互或现有 ToolCard 外观。
- 不把 Inspector selection、scroll offset 或 disclosure 写入模型 transcript。
- 不改变 PermissionManager 的安全决策、持久化规则或 Harness 队列。
- 不恢复旧 Session 中从未记录的 SubAgent Tool result。

## Decisions

### 1. Inspector 是独立可聚焦 Component

新增 `TuiActivityInspector`，由 `TuiApp` 通过 `showOverlay()` 挂载。Inspector 自身实现
`Component.handleInput()`，TUI focus 在三个明确 owner 间切换：

```text
Chat mode       Permission mode       Inspector mode
Editor focus -> Permission focus  ->  Activity Inspector focus
```

应用级 input listener 只保留 `Ctrl+E`、终止 Turn 和模式切换。进入 Inspector 时保存
Editor 内容并将 focus 交给 overlay；退出后明确恢复 Editor focus。

**替代方案：** 继续由 `TuiApp.handleInput()` 分派所有按键。该方式会继续把 Editor、
Permission、MCP browser 和 disclosure 状态耦合在一个条件链中，不采用。

### 2. Selection 使用稳定 identity，不使用动态数组下标

每个 inspectable activity 生成稳定 ID：

```text
thinking:<messageId>
main-tool:<toolCallId>
agent:<agentId>
agent-tool:<agentId>:<toolCallId>
```

Inspector 保存 `selectedId`，每次 render 由 canonical projection 重新解析该 ID。新增
Activity 不改变现有 selection。只有 selection 对应项消失时才按以下优先级回退：

1. 当前 Permission Tool；
2. 最新 running Tool 或 Agent；
3. 当前 streaming Thinking；
4. 时间上最近的 inspectable item。

进入 Inspector 时也使用该优先级，因此用户通常只需 `Ctrl+E`、`Enter`，无需在动态
列表中追逐目标。

### 3. 导航与 activate 采用小型统一协议

Inspector 内：

- `Tab` / `Shift+Tab`：下一个/上一个 inspectable item；
- `Enter` / `→`：Thinking 或 Execution 展开/收起；Tool 打开 output viewport；
- `←`：从 output 返回列表，或收起当前 disclosure；
- `↑` / `↓`、`J` / `K`：等价辅助导航；
- `Ctrl+E` / `Esc`：关闭 Inspector 并恢复 Editor focus。

`Ctrl+R`、`Ctrl+O`、`Ctrl+N` 不再作为 disclosure 入口。Chat 模式下这些按键不被
Conversation 层消费。

### 4. Disclosure state 独立于 canonical conversation data

Canonical projection 只提供 activity 数据；Inspector 使用
`Map<ActivityId, DisclosureState>` 保存纯 UI 状态。默认值继续遵守现有规则：

| Item | Running | Completed | Permission |
|---|---:|---:|---:|
| Thinking | collapsed | collapsed | collapsed |
| Execution Tools | expanded | collapsed | expanded + locked |
| Tool output | closed | closed | permission panel |

用户手动修改后，progress snapshot 不覆盖该状态。Tool/Agent 终态改变可以更新状态
badge，但不改变当前 selection。

### 5. TUI 与 Web 共用 canonical projection transition

将 TUI 的 `thinkingBuffer`、`toolEntries` 和 replay 分支逐步收敛到 shared
`UIMessage[]`：

1. shared event adapter 将 Harness Event 转为 canonical conversation action；
2. shared reducer 按 messageId/toolCallId/agentId upsert；
3. Web 继续通过 WebSocket `ServerEvent` 调用相同 transition；
4. TUI renderer 和 Inspector 都只读取 canonical snapshot；
5. display reconstruction 产生同结构的 history-ready snapshot。

该设计不要求 Web 与 TUI 使用相同组件，只要求状态和 identity 同源。

**替代方案：** 只给现有 `ContentBlock` 增加 Inspector 索引。该方案可以短期修键位，
但 live/history/Web 三条路径仍然漂移，不符合本次系统性重设计目标。

### 6. Tool result 分为摘要与 lossless detail

Main `ToolCallEntry` 与 SubAgent `AgentToolActivity` 均携带 `toolCallId`，并支持：

```typescript
interface ToolResultProjection {
  summary?: string;
  text?: string;
  ref?: {
    owner: "session" | "agent-process";
    ownerId: string;
    toolCallId: string;
  };
  charCount?: number;
  lineCount?: number;
}
```

短结果可直接内联 `text`；大结果通过 `ref` 解析 Session transcript 或 Agent Process
runtime snapshot。UI formatter 只生成 summary/Markdown presentation，不再修改或覆盖
lossless source。

Inspector output viewport 维护独立 `lineOffset`，一次最多渲染固定行数，并支持
`PgUp`、`PgDn`、`Home`、`End`。限制只作用于当前 frame，不作用于 result 数据。

**替代方案：** 将任意大小的完整 result 复制进每个 UI snapshot。实现简单，但大输出
会被 Event、WebSocket 和 rerender 多次复制，内存与延迟不可控，因此使用 inline/ref
混合表示。

### 7. Permission 使用 owner-bound focus lock 与直接键

Permission 出现时保持所属 Agent/Tool identity，并获得高于 Inspector 和 Editor 的输入
优先级。默认选中 Allow once：

```text
1  Allow once
2  Allow matching calls for this Session
3  Save matching rule to Settings
4  Send guidance instead
D  Deny
```

`Enter` 确认当前选项。需要 exact/fuzzy scope 的二级选择时继续使用数字键，不要求方向
键。Permission 解决后 overlay 消失并恢复到之前的 Inspector 或 Editor focus；不得在
对话中追加永久 Permission 消息。

### 8. 真实 PTY 验证是交互完成门槛

除 reducer/component 单元测试外，使用 tuistory 在 120×36 与 80×24 终端验证：

- streaming Thinking 中 `Ctrl+E` → `Enter`；
- Activity 更新期间 selection 保持；
- `Tab` / `Shift+Tab` 与 output paging；
- SubAgent Permission 数字键审批；
- Permission 解决后 focus 恢复；
- Editor 中普通输入不被旧 disclosure 快捷键拦截。

## Risks / Trade-offs

- **[Canonical reducer 重构影响 live/history 两条路径]** → 先增加 shared adapter 和
  fixture，逐事件迁移；旧 `ConversationView` API 在迁移完成前保留薄兼容层。
- **[旧 Session 缺少 toolCallId 或 SubAgent Tool result]** → 使用可选字段和 agentId
  fallback；只显示可证明的摘要，不伪造 result。
- **[大 Tool result 解析仍可能耗时]** → 只按 viewport 读取和 wrap 当前行窗口，大结果
  使用 ref，不在每次 render 中 JSON stringify 全量内容。
- **[Permission 与 Inspector overlay focus 竞争]** → Permission 是唯一最高优先级
  capturing overlay；解决后按保存的 previous focus 明确恢复。
- **[终端对组合键编码存在差异]** → 主要导航使用 Tab、Enter、Esc 和数字键；继续通过
  `matchesKey()` 兼容 Kitty keyboard protocol，并在真实 PTY 覆盖。

## Migration Plan

1. 扩展 shared identity/result types 和 pure reducer tests，保持新增字段可选。
2. 为 Main/SubAgent Tool lifecycle 投影 lossless result 或 result ref。
3. 新增 Inspector component 与 disclosure store，不立即删除旧快捷键。
4. 将 TUI live/history renderer 切换到 canonical snapshot。
5. 启用 `Ctrl+E`、组件 focus 和 Permission 数字键，删除旧 `Ctrl+R/O/N` 路由。
6. 完成 tuistory 回归后移除旧 mutable state 和兼容代码。

回滚时可重新启用旧 renderer/shortcut feature path；新增 optional projection 字段不会
破坏 Session 或 Agent Process Store。

## Open Questions

- 无阻塞问题。大 Tool result 的 inline threshold 作为实现常量由基准测试确定，不属于
  用户可见协议。
