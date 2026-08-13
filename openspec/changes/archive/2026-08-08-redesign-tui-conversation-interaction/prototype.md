## Prototype Files

- [`docs/prototypes/archive/2026-08-08-redesign-tui-conversation-interaction/redesign-tui-conversation-interaction-workbench.html`](../../../../docs/prototypes/archive/2026-08-08-redesign-tui-conversation-interaction/redesign-tui-conversation-interaction-workbench.html)
  — 自包含 TUI Interaction Workbench，覆盖 Chat、Activity Inspector、Thinking
  disclosure、完整 Tool output viewport、SubAgent Permission、Completed、Error、
  80/120 列与亮暗主题。

## Confirmed Decisions

- `Ctrl+E` 是 Chat 与 Inspector 之间的单一入口；`Esc` 返回 Editor。
- Inspector 打开时自动定位 Permission 或当前最具体活动。
- `Tab` / `Shift+Tab` 是主要 selection 导航；`↑` / `↓` 与 `J` / `K` 仅为辅助。
- `Enter` 展开/收起 Thinking 或 Execution，选中 Tool 时打开 output viewport。
- Tool output 通过 `↑` / `↓` / `J` / `K` 逐行浏览，并通过 `PgUp` / `PgDn`、
  `Home` / `End` 分页；`Esc` / `←` 返回 Activity 列表，viewport 不截断权威结果。
- Permission 显示 `Agent › Tool` owner path，并使用 `1-4`、`Enter`、`D` 直接操作。
- Chat 模式移除 `Ctrl+R`、`Ctrl+O`、`Ctrl+N` 的全局 disclosure 语义。
- Editor、Inspector 和 Permission 各自拥有明确 focus lifecycle。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-08-redesign-tui-conversation-interaction/redesign-tui-conversation-interaction-workbench.html` | `archive` | The workbench remains durable acceptance evidence for Chat/Inspector focus, activity hierarchy, long-output paging, owner-bound Permission, terminal widths, and terminal states. The implementation matches its interaction contract, while adding lazy result-reference resolution and legacy Session boundaries that do not invalidate the prototype. |

## Validation

- 浏览器验证 `Ctrl+E` 从 Chat 打开 Inspector，`Esc` 返回。
- 从默认 active Researcher 使用三次 `Shift+Tab` 定位 Thinking，`Enter` 成功展开。
- 使用 `Tab` 定位 173 行 read_file，`Enter` 打开完整 output viewport。
- 验证 `PgDn` 翻页和 `←` 返回原 Tool selection。
- Permission 状态验证 `1` 可直接 Allow once 并退出 focus lock。
- 验证 80/120 列、Chat/Inspector/Permission/Completed/Error 和亮暗主题。
- HTML inline script 可独立解析，浏览器控制台无错误。
- 实现后使用 `tuistory@0.10.1` 在 120×36 和 80×24 的真实 PTY 中复核
  `Ctrl+E`、Enter/Tab、`PgDn`/`End`、Editor 草稿保持和焦点恢复。
- 使用 owner-bound SubAgent Permission 驱动复核 `Researcher > bash`、数字键 `1`
  直接 Allow once，以及 Permission 结束后 Editor 输入恢复。
- 根据真实截图补充 120×36 large-paste 回归：21 行用户输入仅显示首行与字符/行数，
  streaming Thinking 保持可见，canonical message 保留完整文本。
- 使用实际构建命令
  `node ./dist/dscode.mjs --cwd /Users/bytedanceo/Workspace/DeepSeekSpace/html-canvas`
  在 120×36 与 80×24 验证空态 Inspector、草稿保持和 Editor focus；仅因执行沙箱禁止
  写入真实 `~/.dscode/checkpoints`，PTY 验收将 `HOME` 指向隔离的 `/tmp` 目录。
- 使用确定性 activity fixture 验证 running Researcher 默认展开、Main Tool 的 80 行结果
  在 Chat 仅显示单行 `80 lines · 1,190 chars`，Inspector 显示 12 行 viewport 且
  `PgDn` 正确切换到 13-24 行。
- 使用确定性 Permission fixture 在 80×24 验证 `Researcher > bash` owner path、
  数字键 `1` Allow once，以及解决后输入 `focus restored` 落回 Editor。
- 使用 213 列中英混合 Thinking fixture 验证 visible width 不超过终端宽度，进程不再因
  `Rendered line exceeds terminal width` 退出。
- 注入 Kitty `Ctrl+E` press/release 序列，验证 release 不撤销 press 打开的 Inspector；
  Esc 关闭后 processing 期间按 ↑ 不再恢复历史 prompt。
- processing tips 只保留 `Ctrl+E` Inspector 与 Esc/Tab/Ctrl+C abort 等当前可执行操作。
- 使用 40 行 Skill result 复现 output viewport：Down 从 `Lines 1-12` 移动到
  `Lines 2-13`；第一次 Esc 返回 Activity 列表，第二次 Esc 关闭 Inspector。
