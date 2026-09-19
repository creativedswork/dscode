## Prototype Files

- `docs/prototypes/archive/2026-09-20-add-interactive-plan-mode/add-interactive-plan-mode-chat-alignment.html` — 当前设计事实源。复用 dscode Chat shell、暖色 `--color-*` tokens、现有 composer 和权限卡片形态；覆盖待对齐、已对齐、信息充分直接执行和现有权限确认四个场景。

已确认的交互和视觉决策：

- composer 保持单一 Chat 输入，不展示“自动 / 规划”模式。
- Agent 自主规划、调查、选择技术路径、回溯和重新规划。
- 只有视觉风格、产品范围、兼容承诺等用户价值判断进入 Chat 内联对齐。
- 对齐项包含一句问题、可选推荐、最多三个用户可理解选项和自定义输入。
- 对齐选择成为显式约束后，Agent 在同一 Chat 中继续执行。
- 受保护副作用继续使用现有权限卡片，不增加整份 Plan 审批。
- 内部授权后，从 PlanRecord 投影一份默认折叠的全局计划输出，位于实时 TODO 之前；展开后显示目标、确定方案、范围、步骤和验证方式。
- 折叠的 Plan 标题只显示计划状态，不把内部执行步骤数显示为任务数。
- 实时 TODO 独立读取 Main AgentContext 的 TaskState，并用“核心玩法可运行”“桌面端游戏可玩”“移动端与离线交付可用”等可观察成果表达当前状态。
- 文件、组件、命令、测试和用户人工验收不形成 TODO；完成、进行中、待处理状态不从 Plan 步骤推导。
- revision、digest、候选树、Agent evidence 和 hidden reasoning 不形成独立 UI。

浏览器验证：

| Area | Result |
|---|---|
| 待对齐场景在 Chat 时间线内显示 | 通过 |
| 三个候选指针选择与 roving keyboard focus | 通过 |
| 自定义方向提交并恢复 Agent 执行 | 通过 |
| 信息充分的请求跳过重复对齐 | 通过 |
| 现有权限确认取代整份 Plan 审批 | 通过 |
| 全局计划默认折叠、可展开且位于 TODO 之前 | 通过 |
| Plan 标题不显示内部步骤数或 TODO 数量 | 通过 |
| TODO 显示三个成果状态而非文件、实现阶段或测试活动 | 通过 |
| replan 更新同一计划输出而不重复插入 | 自动化通过；实际 Web 证据不足 |
| Light/Dark token 切换 | 通过 |
| `390x844` 无水平溢出且所有可见控件在 viewport 内 | 通过 |
| `1440x900` 无水平溢出 | 通过 |
| `1080x322` 使用单一 conversation 滚动区，TODO 可完整滚动到 composer 上方 | 通过 |
| 页面 JavaScript 异常 | 未发现 |

本轮使用浏览器交互验证折叠、展开和主题切换，并使用固定 CSS viewport 复验
`390x844`、`1440x900` 和 `1080x322`。首次移动截图发现根容器隐藏横向裁切，修复
flex/grid 子项宽度后，文档、body、场景栏和 conversation 的 `scrollWidth` 均不超过
对应 `clientWidth`。原型结果不作为实际产品 Web 的运行证据。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-09-20-add-interactive-plan-mode/add-interactive-plan-mode-chat-alignment.html` | `archive` | 原型定义了可复用的 Chat 原生意图对齐、折叠 Plan 与 context-owned TODO 状态矩阵；当前实现与 design tokens 保持一致，且 M9 已完成实际 Web/TUI 验收。 |
