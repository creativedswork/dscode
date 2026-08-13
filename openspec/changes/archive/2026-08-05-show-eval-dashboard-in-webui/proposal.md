## Why

`/eval` 已生成自包含的 CHIEF HTML 报告，但即使命令从 WebUI 发起，当前仍通过系统 `open` 在外部浏览器打开。WebUI 已有 sandboxed `ArtifactContainer`，却没有接收、区分和展示 Eval 报告的协议，用户因此被迫离开当前工作界面，且 Eval 报告可能与可编辑的 Session Dashboard 缓存和输入语义混淆。

## What Changes

- 在 WebSocket 协议中新增带 `targetSessionId`、`runId`、状态、阶段和可选 HTML/error 的 typed Eval Dashboard 事件，覆盖 `starting / running / completed / failed`。
- WebUI prompt 提交 `/eval` 后，命令处理器 SHALL 在第一次异步 Session I/O 或 CHIEF worker 启动前发布 `starting`，使前端立即切换到 Eval 模式；不继续停留在 Chat 中按命令行式文本等待。
- `/eval` 在 WebUI 模式下持续发布 stage、worker、retry、elapsed time 和 trajectory/evidence 摘要；完成态直接发送已落盘的自包含 HTML，不重新调用模型生成报告。
- 将 WebUI 视图从 `chat | dashboard` 扩展为 `chat | session_dashboard | eval_dashboard`，但 Eval 模式的整个主区域 SHALL 只展示 Eval preparing/progress/report/failure 内容；Chat 与 Session Dashboard 仅保留为顶部返回导航，不在 Eval 主区域放置占位页。
- Session Dashboard 只能由非空 Chat 视图中的显式点击进入；Eval 模式下 Dashboard 控件禁用，程序化 mode change 与已启动但过期的 Chat → Dashboard 转场也不得直接切入。
- 顶部 `Chat / Dashboard / Eval` selector 始终展示三个模式且 Eval 可点击；无 lifecycle、已有 Completed/Failed 或恢复了缓存报告时，点击 Eval 都复用标准 slash command 发送 `/eval` 并启动当前 Session 的新 run。仅在 Starting/Running 尚未结束时，点击 Eval 只回到当前进度，避免并发重复。
- Eval 的 Starting、Running 和 Failed lifecycle 页面使用与 ChatView 一致的主区域 gutter，并铺满主区域可用宽高；不得把核心进度压缩在固定宽度的中央小卡片中。
- Completed 与失败回退报告的 iframe 必须占满 Eval toolbar 和只读 footer 之间的剩余高度，长报告在 iframe 内滚动，不得回落到浏览器默认的约 150px iframe 高度并暴露外层空白。
- 复用 `ArtifactContainer` 的 sandboxed `iframe.srcDoc` 渲染 Eval HTML，同时为 Eval 增加目标 Session、run ID、证据状态和“外部打开”元数据栏。
- Eval Dashboard 保持只读：不把 MessageInput 路由到 `artifact update`，不修改报告 HTML，也不写入 Main Agent transcript。
- 为 Eval artifact 使用独立缓存命名空间和 `targetSessionId + runId` 身份，禁止覆盖或误用现有 Session Dashboard cache。
- 评估历史 Session 时只展示报告目标，不自动切换当前 Session；Session 切换后保留可再次打开的当前 Eval artifact，直到新的 Eval 替换它。
- 统一 Session 切换入口解析目标时同时合并当前项目索引、受限全局索引和当前 Session；即使项目 Session 已被全局索引容量淘汰，Web 侧边栏中可见的 Session 仍必须能够加载。
- 保持 TUI 行为兼容：成功后继续通过系统浏览器打开 `<session-prefix>.html`；WebUI 仍提供显式“外部打开”入口。
- 失败时不覆盖最后成功报告；若同一目标 Session 存在完整成功报告，Eval 视图自动展示该历史报告并明确标注本次失败阶段、当前 run 与历史 run，严禁跨 Session 回退；若不存在则显示空白失败页。

## Capabilities

### New Capabilities

- `eval-dashboard-webui`: 定义 `/eval` 即时自动跳转、长时 CHIEF 进度、只读 HTML 嵌入、目标身份、失败状态和外部打开行为。

### Modified Capabilities

- `eval-dashboard`: 将报告呈现从无条件外部打开调整为 WebUI 内嵌、TUI 外部打开，并保持落盘 HTML 为持久化来源。
- `websocket-protocol`: 增加 typed Eval Dashboard 状态事件，携带 run/target identity、阶段、HTML 或错误。
- `session-view-mode`: 将 Dashboard 拆分为可编辑的 Session Dashboard 与只读 Eval Dashboard，并定义切换、输入和 Session 变更语义。
- `session-switching`: 目标预检合并项目与全局 Session 索引，避免全局索引淘汰造成可见 Session 无法加载。
- `dashboard-cache`: 为 Eval artifacts 增加与 Session Dashboard 隔离的缓存身份和失效规则。

## Impact

- **Eval orchestration**：`src/eval/index.ts` 发布 Eval Dashboard 状态，并按前端能力选择内嵌或外部打开。
- **共享事件/协议**：`src/core/events.ts`、`src/ui/shared/types.ts`、`src/ui/web/web-backend.ts` 增加 typed Eval artifact 投影。
- **Web frontend**：`web/src/components/App.tsx`、`ArtifactContainer.tsx`、`MessageInput.tsx` 和 dashboard cache utilities 支持独立 Eval 模式。
- **Session switching**：`src/core/harness.ts` 合并项目/全局/current 候选；`tests/core/session-switching.test.ts` 覆盖全局索引淘汰后的项目 Session 解析。
- **兼容性**：`~/.dscode/eval/<prefix>.html` 与 run 内 `output/dashboard.html` 路径不变；TUI 和旧 Session 行为不变。
- **安全边界**：不新增对 `~/.dscode/eval` 的通用静态文件服务，不接受客户端提供文件路径；后端只发送本次已验证 run 的 HTML。
- **UI 依据**：`docs/prototypes/archive/2026-08-05-show-eval-dashboard-in-webui/show-eval-dashboard-in-webui-embedded-report.html`。
