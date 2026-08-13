# Prototype: unified-tool-approval-card

## Prototype Files

- `docs/prototypes/archive/2026-08-13-unified-tool-approval-card/unified-tool-approval-card-conversation.html` — 自包含单文件 Web 原型，演示统一审批卡片方案。核心视觉方向：
  - **吸底停靠的独立审批卡片**：`position: sticky; bottom: 0`，始终停靠在对话滚动区底部、输入框上方，不被并行 SubAgent 卡片挤出视野。
  - **来源 Agent 归属**：卡片头部 `Permission Required` 旁标注 `from <label> · <agentId> · <application>`，无需展开 SubAgent 卡片即可识别请求方。
  - **与 SubAgent 卡片解耦**：SubAgent 卡片默认折叠 Tool timeline，「Show tools」开关可用（不再因待审批而锁定）。
  - **New/Old 模式切换**、**来源 Agent 切换**、**亮/暗主题切换**。

- `docs/prototypes/archive/2026-08-13-unified-tool-approval-card/unified-tool-approval-card-tui.html` — 自包含单文件 TUI 终端 workbench 原型，演示统一权限面板方案。核心视觉方向：
  - **对话底部独立权限面板**：`Owner: Researcher › read_file` + preview + 5 个决策项（`1` Allow once / `2` session grant / `3` saved rule / `4` guidance / `D` Deny），独立于 Execution Card。
  - **与 Execution Card 解耦**：Execution Card 默认折叠 Tool timeline，不再因待审批而强制展开。
  - **New/Old 模式切换**（独立面板 vs 内嵌 Tool timeline）、**80/120 列切换**、**亮/暗主题切换**。

关键设计决策（已确认）：Web 吸底停靠、TUI 对话底部块；来源归属 Web 采用「label + agentId + application」、TUI 采用 `Owner: <label> › <toolName>`；两端复用既有决策体（Web `InlinePermission`、TUI `renderPermPrompt`）。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-13-unified-tool-approval-card/unified-tool-approval-card-conversation.html` | `archive` | 与最终实现及 design tokens 一致；提供可执行的吸底卡片/来源归属/New-Old 对比状态矩阵，供后续视觉回归复用 |
| `docs/prototypes/archive/2026-08-13-unified-tool-approval-card/unified-tool-approval-card-tui.html` | `archive` | 与最终实现及 `c.*` theme 一致；提供可执行的底部面板/owner path/80-120 列对比状态矩阵，供后续视觉回归复用 |

## Prototype Status

UI change — prototype required and present (Web + TUI, see above).
