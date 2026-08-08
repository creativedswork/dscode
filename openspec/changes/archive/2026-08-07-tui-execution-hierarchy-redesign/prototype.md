## Prototype Files

- [`docs/prototypes/archive/2026-08-07-tui-execution-hierarchy-redesign/tui-execution-hierarchy-redesign.html`](../../../../docs/prototypes/archive/2026-08-07-tui-execution-hierarchy-redesign/tui-execution-hierarchy-redesign.html)
  — 自包含交互原型，定义 `Turn → Execution → Tool` 信息层级；SubAgent Tool timeline
  和 Permission 原位嵌入 Agent Card，`spawn_agent` 不再重复为普通 Tool。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-07-tui-execution-hierarchy-redesign/tui-execution-hierarchy-redesign.html` | `archive` | 定义跨 TUI/Web 可复用的 Turn → Execution → Tool 信息架构，并保留 Permission、失败态、折叠态、宽窄终端和亮暗主题的可执行状态矩阵；实现与验证仍与原型一致。 |

## Confirmed Decisions

- Thinking 与 Tools 使用独立 disclosure，可分别折叠。
- Running 默认展开 Tools；Completed 默认折叠；Failed 默认展开失败 Tool；
  Permission 强制展开且审批期间不可收起。
- 折叠态保留 Tool 数量、成功/失败/运行统计；底部 status line 始终显示最具体活动。
- Permission 出现在所属 Tool 下，解决后从主对话消失并归并为 Tool 状态。
- 结果详情使用渐进展示；完整数据继续保留在 Runtime transcript、Session 或
  Agent Process Store，不因 TUI 可见预算而删除。
- 原型覆盖 Running、Permission、Completed、Failed、Thinking/Tools 折叠、
  80/120 列和亮暗主题。

## Validation

- 浏览器逐项验证 Thinking/Tools `aria-expanded` 与实际显隐一致。
- Permission 状态验证 Tools 强制展开且点击无法收起。
- Completed 状态验证 Thinking/Tools 默认折叠、result 保持可见。
- Failed 状态验证失败 Tool 默认展开。
- 751px viewport 下 `body.scrollWidth === viewport width`，无横向溢出。
- 独立加载验证控制台无 JavaScript 错误。
