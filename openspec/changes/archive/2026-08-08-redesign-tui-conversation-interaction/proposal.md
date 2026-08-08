## Why

当前 TUI 虽已具备 Turn → Execution → Tool 层级，但交互仍依赖
`Ctrl+R`、`Ctrl+O`、`Ctrl+N` 等全局快捷键隐式猜测操作目标。运行过程中 Thinking、
Tool 和 SubAgent 持续新增或更新，焦点缺乏可见性和稳定 identity，导致展开状态易失、
长 Tool 输出只能看到多次截断的摘要，SubAgent Permission 即使显示在 Card 内也难以
可靠操作。

## What Changes

- 新增统一的 Activity Inspector。`Ctrl+E` 从 Chat 进入 Inspector，并自动定位当前
  Permission 或最具体的活动项；再次按 `Ctrl+E` 或 `Esc` 返回 Editor。
- Inspector 使用稳定 activity identity 保持焦点。`Tab` / `Shift+Tab` 为主要切换方式，
  `Enter` 展开、收起或打开详情；`↑` / `↓` 与 `J` / `K` 仅作为辅助导航。
- **BREAKING** 移除 `Ctrl+R`、`Ctrl+O`、`Ctrl+N` 作为 Thinking/Tool/SubAgent
  disclosure 的全局交互入口，避免在 Editor 聚焦和动态列表更新时产生歧义。
- Chat 保持紧凑的摘要视图；Thinking、Main Tool、SubAgent、SubAgent Tool 和 result
  统一在 Inspector 中按 owner 层级浏览，运行时更新不得重置当前 selection 或 disclosure。
- Tool result 改为“摘要 + 完整详情 viewport”模型。显示层可以限制一次可见行数，但
  canonical UI projection、Session 或 Agent Process Store 必须保留完整结果，不得在
  formatter 和 TUI renderer 中重复截断。
- Main Tool 与 SubAgent Tool 均使用稳定 `toolCallId` 更新；SubAgent Tool Activity
  可携带 args、result 和 error details，使 Inspector 能浏览真实 Tool 输出。
- SubAgent Permission 继续绑定所属 Agent/Tool，并在待处理时获得最高输入优先级。
  用户可通过数字键直接选择、`Enter` 确认、`D` 拒绝，无需依赖动态列表中的方向键。
- WebUI 视觉交互保持不变，但 Web 与 TUI 必须消费相同 canonical conversation、
  execution 和 Tool result 语义，避免继续维护两套消息状态机。

## Capabilities

### New Capabilities

- `tui-activity-inspector`: 定义 TUI Chat/Inspector 焦点模式、稳定 activity selection、
  disclosure 操作、完整 Tool output viewport 和 Permission 输入优先级。

### Modified Capabilities

- `tui-execution-hierarchy`: 将 Thinking/Tools 的全局快捷键折叠改为 Inspector 内的
  owner-aware disclosure，并补充运行时焦点稳定与完整结果可访问要求。
- `shared-conversation-model`: 为 Main/SubAgent Tool Activity 补齐稳定 toolCallId、
  args/result/error 数据，并要求 TUI 与 Web 由同一 canonical reducer/projection 驱动。
- `agent-activity-display`: SubAgent Tool timeline 从状态摘要扩展为可供 Inspector
  浏览的完整 Tool Activity，同时保持 Card 紧凑展示和 Permission 原位归属。

## Impact

- 主要影响 `src/ui/tui-app.ts`、`src/ui/conversation.ts`、新的 Inspector Component、
  `src/ui/tui-backend.ts`、`src/ui/shared/types.ts`、`src/ui/shared/reducer.ts`、
  `src/ui/shared/agent-activity.ts` 和 SubAgent runtime Tool progress projection。
- Tool 事件和 shared UI types 将增加可选、向后兼容的 identity/result 字段；旧 Session
  缺少字段时继续显示已有摘要，不伪造完整 Tool output。
- TUI 输入路由由全局 mutable 状态转为 Editor、Inspector、Permission 各自拥有焦点和
  `handleInput` 生命周期；Harness、Agent Process 与 foreground/background 语义不变。
- 不引入新的运行时依赖，不改变模型 transcript，不把 UI disclosure state 写入 Session
  或模型上下文。
