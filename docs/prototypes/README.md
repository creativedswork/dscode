# Prototypes

本目录存放 explore 阶段生成的 HTML 前端原型。

## 规范

原型生成规范见 skill：**`prototype-workflow`** (`.dscode/skills/prototype-workflow/SKILL.md`)

生成原型前 Agent 会加载该 skill，自动包含以下约束：
- UI 变更必须生成至少一个自包含 HTML 原型，纯文字视觉说明不能替代
- 仅严格非 UI 变更允许在 OpenSpec 中使用 `No prototype needed` stub
- 格式: 自包含单文件 HTML
- 风格: 对齐 `web/src/index.css` 的 `--color-*` design tokens
- 工具: 自动加载 `html-output` skill

## 文件

- `adapt-eval-to-subagents.html` — `/eval` 基于 CHIEF 评估 Main/SubAgent 统一轨迹的交互原型，覆盖完整 transcript、记录缺失和单 Agent 兼容状态
- `builtin-tool-result-rendering-fix-v5.html` — 内置工具结果展示修复原型
- `include-subagents-in-session-dashboard-overview.html` — Session Dashboard 展示 SubAgent 执行指标、记录和空/失败状态的交互原型
- `mcp-toolcard-execution-view-prototype.html` — Session 00MRIZMZQJ，MCP 工具执行视图的原型设计
- `markdown-line-split-fix.html` — 修复 content.split('\n') 破坏多行 Markdown 结构的原型
- `settings-cache-management.html` — Settings 缓存管理界面原型
- `show-eval-dashboard-in-webui-embedded-report.html` — WebUI Eval-only 主区域，覆盖 `/eval` 即时跳转、长时 CHIEF 进度、完成/失败状态及只读报告嵌入
- `show-subagents-in-conversation.html` — SubAgent 在 Web/TUI 对话流中的 Agent Activity Card 交互原型
- `web-ui-redesign-editorial-workshop-v3.html` — Editorial Workshop Web UI 视觉原型
