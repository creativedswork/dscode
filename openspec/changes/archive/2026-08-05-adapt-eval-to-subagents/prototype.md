## Prototype Files

- `docs/prototypes/archive/2026-08-05-adapt-eval-to-subagents/adapt-eval-to-subagents.html` — 自包含 CHIEF Multi-Agent Eval Dashboard 原型。确认使用 Agent Process Lanes 表达 Main/SubAgent 并发执行，以 `Application + 6 位 Agent ID` 展示真实责任主体，以跨 Agent 因果链区分根因、下游症状和恢复，并展示 Subtask → Agent → Step 三级回溯。

## Prototype Status

已完成浏览器验证：

- **完整轨迹**：展示 1 个 Main、3 个 SubAgent、完整 transcript 指标、Step 级根因和跨 Agent 恢复链。
- **记录缺失**：显示 summary/missing transcript 告警并降低 Evidence Quality/Confidence。
- **单 Agent**：隐藏 SubAgent lanes，保留 Main-only 兼容状态。
- **主题与交互**：亮暗主题、三种场景切换均生效；浏览器控制台无脚本错误。

视觉实现使用 `web/src/index.css` 同源的 `--color-*` token 语义、自包含 CSS/JavaScript、响应式双栏到单栏布局，不依赖外部资源。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-05-adapt-eval-to-subagents/adapt-eval-to-subagents.html` | `archive` | 保留 Main/SubAgent 并发轨迹、记录缺失和单 Agent 兼容的可执行状态矩阵，供后续 Eval 设计与回归复用。 |
