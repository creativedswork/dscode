## Prototype Files

- `docs/prototypes/add-interactive-plan-mode-chat-alignment.html` — 当前设计事实源。复用 dscode Chat shell、暖色 `--color-*` tokens、现有 composer 和权限卡片形态；覆盖待对齐、已对齐、信息充分直接执行和现有权限确认四个场景。
- `docs/prototypes/add-interactive-plan-mode-workbench.html` — 被用户验收否决的旧工作台方案，仅保留到 apply 阶段执行 retention 决策，不再作为实现依据。

已确认的交互和视觉决策：

- composer 保持单一 Chat 输入，不展示“自动 / 规划”模式。
- Agent 自主规划、调查、选择技术路径、回溯和重新规划。
- 只有视觉风格、产品范围、兼容承诺等用户价值判断进入 Chat 内联对齐。
- 对齐项包含一句问题、可选推荐、最多三个用户可理解选项和自定义输入。
- 对齐选择成为显式约束后，Agent 在同一 Chat 中继续执行。
- 受保护副作用继续使用现有权限卡片，不增加整份 Plan 审批。
- PlanRecord、revision、digest、PlanItem、Agent evidence 和 hidden reasoning 不形成独立 UI。

浏览器验证：

| Area | Result |
|---|---|
| 待对齐场景在 Chat 时间线内显示 | 通过 |
| 三个候选指针选择与 roving keyboard focus | 通过 |
| 自定义方向提交并恢复 Agent 执行 | 通过 |
| 信息充分的请求跳过重复对齐 | 通过 |
| 现有权限确认取代整份 Plan 审批 | 通过 |
| Light/Dark token 切换 | 通过 |
| `390x844` 无水平溢出且所有可见控件在 viewport 内 | 通过 |
| `1440x900` 无水平溢出 | 通过 |
| `1080x322` 使用单一 conversation 滚动区，确认按钮可滚动到 composer 上方 | 通过 |
| 页面 JavaScript 异常 | 未发现 |

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/add-interactive-plan-mode-chat-alignment.html` | `pending` | Finalize after implementation and browser acceptance |
| `docs/prototypes/add-interactive-plan-mode-workbench.html` | `pending` | Superseded by user decision; finalize deletion during apply retention |
