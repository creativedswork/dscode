# Prototypes

本目录根层是 explore/propose 阶段生成 HTML 前端原型的暂存区。
长期保留的原型位于 [`archive/`](archive/)。

## 规范

原型生成规范见 skill：**`prototype-workflow`** (`.dscode/skills/prototype-workflow/SKILL.md`)

生成原型前 Agent 会加载该 skill，自动包含以下约束：
- UI 变更必须生成至少一个自包含 HTML 原型，纯文字视觉说明不能替代
- 仅严格非 UI 变更允许在 OpenSpec 中使用 `No prototype needed` stub
- 格式: 自包含单文件 HTML
- 风格: 对齐 `web/src/index.css` 的 `--color-*` design tokens
- 工具: 自动加载 `html-output` skill
- 生命周期: apply 完成后逐文件决定 `archive` 或 `delete`；不确定时默认删除
- 归档位置: `archive/YYYY-MM-DD-<change-name>/`

完整的长期价值、有效性和断链检查规则只在 `prototype-workflow` Skill 中维护。

## 暂存原型

## 已归档原型

- [`2026-07-14-fix-explore-prototype-html`](archive/2026-07-14-fix-explore-prototype-html/) — MCP ToolCard Execution View 标准流程案例
- [`2026-07-15-fix-file-upload-cache`](archive/2026-07-15-fix-file-upload-cache/) — Settings 缓存管理状态
- [`2026-08-04-include-subagents-in-session-dashboard`](archive/2026-08-04-include-subagents-in-session-dashboard/) — Session Dashboard SubAgent 概览
- [`2026-08-04-show-subagents-in-conversation`](archive/2026-08-04-show-subagents-in-conversation/) — Agent Activity Card 交互
- [`2026-08-05-adapt-eval-to-subagents`](archive/2026-08-05-adapt-eval-to-subagents/) — CHIEF Multi-Agent Eval Dashboard
- [`2026-08-05-show-eval-dashboard-in-webui`](archive/2026-08-05-show-eval-dashboard-in-webui/) — WebUI Eval 主视图
- [`2026-08-07-tui-execution-hierarchy-redesign`](archive/2026-08-07-tui-execution-hierarchy-redesign/) — Turn → Execution → Tool 信息架构
- [`2026-08-08-redesign-tui-conversation-interaction`](archive/2026-08-08-redesign-tui-conversation-interaction/) — TUI 对话焦点、Activity Inspector、长 Tool 输出与 SubAgent Permission 重设计
