## 变更综述

本变更汇合了两条长期演进路径：一条是 `/eval` 从生成并外部打开单 Session 诊断 HTML，逐步升级为带因果图、阶段进度和多 Agent 证据的 CHIEF 评估；另一条是 WebUI 从可编辑的 Session Dashboard Artifact，逐步获得 sandbox iframe、视图模式、内容哈希缓存和统一暖色设计。最终，WebUI 通过 HarnessEventBus 接收 typed Eval lifecycle，在 `/eval` 提交后立即进入独立、只读的 Eval Dashboard，直接渲染 coordinator 已落盘的同一份 HTML；TUI 仍保持外部浏览器打开行为，Session Dashboard 的生成、编辑、缓存和转场语义不受影响。

## 变更时间线

- 2025-01-21: `session-dashboard` — 建立通用 Artifact 协议、sandbox iframe、Chat/Dashboard 视图与可编辑 Session Dashboard。
- 2026-01-16: `harness-event-bus` — 将 UI 通知统一为 typed Harness events，并把 UiBackend 收敛为生命周期与权限接口。
- 2026-06-03: `eval-slash-command` — 首次引入 `/eval [session_id]`、持久化诊断 HTML 和系统浏览器打开行为。
- 2026-06-15: `fix-eval-progress-and-crash-logging` — 为长时间 Eval 增加阶段进度和可诊断的失败日志。
- 2026-06-23: `session-dashboard-cache` — 为 Session Dashboard 增加 contentHash 缓存和 Session 切换重置语义。
- 2026-06-25: `eval-chiff-causal-graph` — 将 Eval 从扁平分析升级为因果图、数据流和反事实归因。
- 2026-07-27: `web-ui-editorial-workshop` — 固化 38px topbar、暖色 tokens 和 shell-level Dashboard mode switcher。
- 2026-08-04: `include-subagents-in-session-dashboard` — Session Dashboard 开始聚合 SubAgent 记录，并让 Agent 变化参与缓存失效。
- 2026-08-05: `show-eval-dashboard-in-webui` — 将 typed CHIEF lifecycle、只读 Eval artifact 和独立 Eval cache 接入 WebUI。

## 初始设计

最初的 `/eval` 设计解决“如何诊断一个持久化 Session”的问题：命令解析当前或历史 Session，运行分析，生成 `~/.dscode/eval/<session-prefix>.html`，然后无条件调用系统浏览器打开。它把 HTML 文件视为唯一呈现产物，WebUI 与 TUI 没有差异化行为。

与之并行，Session Dashboard 建立了另一套 WebUI Artifact 设计：后端通过 `artifact_start/delta/end` 流式生成 HTML，前端用 `ArtifactContainer` 的 `iframe.srcDoc` 和 `sandbox="allow-same-origin"` 渲染；Chat 与 Dashboard 互斥切换，Dashboard 输入作为 `artifact update` 指令，不写入对话历史。后续 contentHash 缓存和 Session 切换规则进一步把该 Artifact 明确绑定到当前 Session。

这两套设计长期独立：Eval 有可信持久化 HTML，但只能外部打开；WebUI 有成熟 HTML 容器，但其 Artifact 是可变、由 LLM 二次生成且与当前 Session cache 绑定，不能直接承载 Eval 报告。

## 变更记录

### 变更: Eval 从扁平报告升级为 CHIEF 因果诊断
- **触发**: 一次性读取日志并直接给结论缺乏 Agent、Step、数据流和反事实层级，难以定位真实根因。
- **改动**: 引入因果图、Oracle、backtrack、attribution、rules 和 Dashboard 阶段，并保留自包含 HTML 作为最终持久化产物。
- **影响**: Eval 运行时间增加且阶段结构稳定为七步，为 WebUI 提供结构化长时进度的基础。

### 变更: UI 通知统一走 HarnessEventBus
- **触发**: Harness 直接调用大量 UiBackend 方法，新增呈现能力需要修改核心接口并产生后端类型耦合。
- **改动**: 建立 discriminated union 事件总线，Web 与 TUI 各自订阅；UiBackend 保留四个生命周期/请求响应方法。
- **影响**: 本变更可增加 `eval:dashboard` domain event，而无需新增 `showEvalDashboard()` 或判断 WebUiBackend 类型。

### 变更: Session Dashboard 获得独立缓存与切换语义
- **触发**: Session 切换后旧 Dashboard 仍显示，同时相同内容每次进入都重复调用模型。
- **改动**: 增加 `dscode-dash-cache`、contentHash 校验、20 条缓存上限和 Session Dashboard → Chat 重置。
- **影响**: Eval 不能复用该 cache 身份；最终新增 `dscode-eval-dash-cache`，以 `targetSessionId:runId` 存储最多五条不可变报告。

### 变更: WebUI Shell 形成稳定的视图与视觉系统
- **触发**: Dashboard 需要成为 Chat 的主区域模式，而不是侧栏功能；长时运行状态也需要一致的 shell。
- **改动**: 固化 38px topbar、暖色 light/dark tokens、顶部 pill selector、响应式 sidebar 和主区域布局。
- **影响**: 最终 ViewMode 扩展为 `chat | session_dashboard | eval_dashboard`，Eval 在同一 shell 内独占主区域。

### 变更: Eval HTML 直接内嵌而不再重新生成
- **触发**: Web `/eval` 完成后仍调用系统 `open`，用户离开 WebUI；若套用 Session Dashboard 管线则会重复调用模型并错误开放编辑能力。
- **改动**: coordinator 生成一次 HTML 并原子写入 run-local 与兼容路径；completed event 直接携带该 HTML。WebUI 使用 `srcDoc` 渲染，TUI completed subscriber 打开可信路径。
- **影响**: Web 不新增静态 Eval 文件服务，不接受客户端路径；报告 HTML、Session transcript 和 Session Dashboard artifact state 完全隔离。

## 修复记录

### 修复: Eval 长时间无反馈和失败不可诊断
- **症状**: 用户只看到“正在分析”后长时间等待，pipeline crash 缺少 stage 和 stack 上下文。
- **根因**: Eval 只输出最终结果，内部阶段没有稳定的 UI 投影。
- **修复**: 先增加阶段日志与 crash logging；本变更进一步将 Starting、Running、Completed、Failed 作为 typed lifecycle，并携带 worker、retry、elapsed 和 evidence 数据。

### 修复: Dashboard 在 Session 切换后身份错位
- **症状**: 当前 Session 改变后仍显示旧 Dashboard，缓存也可能被错误复用。
- **根因**: 可编辑 Dashboard 与当前 Session 身份没有明确绑定。
- **修复**: Session Dashboard 使用 contentHash 并在 Session 切换时回到 Chat；Eval 则持有独立 target/run 身份，切换当前 Session 时保持报告不变。

### 修复: Eval 失败覆盖或伪装为成功报告
- **症状**: required stage 失败时，部分输出可能被误认为完成，且最近成功报告缺少恢复入口。
- **根因**: 生成、持久化和呈现集中在 `runEval()` 的单一路径，缺少 terminal state 与 artifact 身份边界。
- **修复**: 仅在 Dashboard 完整生成并原子落盘后发布 completed；failed 不携带 HTML、不写 Eval cache，并保留最近成功 artifact 供重新打开。

### 修复: Eval 失败恢复串用其他 Session 报告
- **症状**: attribution 失败后，“最近成功报告”可能打开另一个目标 Session 的 Dashboard，视觉上像本次失败生成了残缺或虚假报告。
- **根因**: 前端按全局 LRU 最近项选择恢复报告，没有用失败事件的 `targetSessionId` 约束 artifact 身份。
- **修复**: Failed 保持失败 lifecycle，仅按相同 `targetSessionId` 和最新 `generatedAt` 自动展示完整历史报告，并同时标注失败 run 与历史 run；同目标没有成功报告时显示空白失败页，禁止跨 Session 回退。

### 修复: Eval 可直接进入 Session Dashboard
- **症状**: Eval 模式仍可点击 Dashboard，或被尚未结束的 Chat → Dashboard 转场回调覆盖。
- **根因**: Session Dashboard 入口只检查消息数量，没有约束来源 ViewMode，转场提交也未复核 Chat 是否仍然活跃。
- **修复**: Session Dashboard 只允许从非空 Chat 显式进入；Eval 中禁用控件，App handler 重复校验来源，转场完成前再次确认仍在 Chat。

### 修复: 项目 Session 被全局索引淘汰后无法加载
- **症状**: Web 侧边栏仍显示当前项目 Session，但点击加载返回 `Session not found`。
- **根因**: 侧边栏读取当前项目索引，统一切换入口却只从容量受限的全局索引和 current metadata 解析目标，两者可见集合不一致。
- **修复**: `switchSession()` 预检合并当前项目索引、全局索引和 current metadata，并按完整 Session ID 去重；项目 Session 不再依赖全局索引保留。

### 修复: Completed 报告 iframe 只显示顶部
- **症状**: Eval 显示 Completed，但报告只占顶部约 150px，其余主区域为空白。
- **根因**: `ArtifactContainer` 使用 `flex: 1`，其直接父级却不是 flex container，iframe 回落到浏览器固有高度；报告 HTML 本身完整。
- **修复**: 将 toolbar/footer 之间的 Eval 内容槽设为 `min-height: 0` 的纵向 flex container，使 Completed 和失败历史报告占满剩余高度并在 iframe 内滚动。

## 最终状态

### Why

`/eval` 已生成自包含的 CHIEF HTML 报告，但从 WebUI 发起时仍会在外部浏览器打开。WebUI 虽已有 sandboxed ArtifactContainer，却没有 Eval lifecycle、只读语义、目标身份或独立缓存，用户会被迫离开当前工作界面，也可能把 Eval 报告与可编辑 Session Dashboard 混淆。

### What Changes

- WebSocket 增加 `eval_dashboard` discriminated union，覆盖 `starting / running / completed / failed`。
- `/eval` 在第一次异步 Session I/O 前同步发布 Starting，WebUI 立即进入 Eval preparation。
- Running 事件携带 target/run、七阶段、Application、6 位 worker Agent ID、retry、elapsed 锚点和 trajectory/evidence 摘要。
- coordinator 只生成一次 HTML，并原子写入 run-local 与兼容路径；Completed 发送这份精确 HTML，不调用第二次模型。
- WebUI ViewMode 扩展为 `chat | session_dashboard | eval_dashboard`；Eval 独占主区域，Chat 和 Dashboard 只保留为顶部导航。
- Session Dashboard 只能从非空 Chat 显式进入；Eval 中 Dashboard 禁用，程序化请求与过期转场不能直接切入。
- Header 始终显示 Chat、Dashboard 和 Eval；无状态或 Completed/Failed/cache 报告下点击 Eval 都复用标准 slash command 发送 `/eval`，由服务端 Starting event 启动当前 Session 新 run；仅 Starting/Running 时只切回进度，避免并发重复。
- Starting、Running 和 Failed 使用与 ChatView 相同的 16px 主区域 gutter 并铺满可用宽高，不再把 lifecycle 内容限制在 610px 居中卡片。
- Completed 与失败历史报告 iframe 占满 Eval chrome 之间的剩余高度，长报告在 iframe 内滚动。
- ArtifactContainer 通过 presentation descriptor 同时服务 Session 与 Eval，iframe 保持 `sandbox="allow-same-origin"` 且不允许脚本。
- Eval 模式隐藏 MessageInput，显示只读 footer；外部打开使用已接收 HTML 创建 Blob URL，不发送服务端路径。
- Eval 使用独立 `dscode-eval-dash-cache`，按 `${targetSessionId}:${runId}` 保存最多五条最近访问的 Completed 报告。
- Running 与 Failed 不写成功缓存；Failed 只自动展示同一目标 Session 按 `generatedAt` 最新的完整报告，并明确区分失败 run 与历史 run；无同目标报告时显示空白失败页。
- 评估历史 Session 不切换当前 Chat Session；当前 Session 切换也不重写已打开 Eval 的 target/run。
- Session 切换目标从项目索引、全局索引和 current metadata 的去重并集解析；全局索引淘汰不再导致项目内可见 Session 无法加载。
- TUI 继续在 Completed 后打开兼容 HTML，WebUI 不自动弹出第二个浏览器窗口。

### Capabilities

#### New Capabilities

- `eval-dashboard-webui`: `/eval` 即时自动跳转、结构化 CHIEF 长时进度、只读 HTML 内嵌、目标身份、失败恢复和显式外部打开。

#### Modified Capabilities

- `eval-dashboard`: 呈现策略变为 WebUI 内嵌、TUI 外部打开，并保持落盘 HTML 为持久化来源。
- `websocket-protocol`: 增加 typed Eval Dashboard lifecycle 和 run/target identity。
- `session-view-mode`: 拆分可编辑 Session Dashboard 与只读 Eval Dashboard，并定义 Session 切换语义。
- `session-switching`: 目标预检合并项目/全局/current Session 候选，并保持不存在与前缀冲突时的无副作用语义。
- `dashboard-cache`: 增加与 Session Dashboard 完全隔离的 Eval artifact cache。

### Impact

- **Eval orchestration**: `src/eval/index.ts`、`src/eval/dashboard.ts` 发布 lifecycle 并生成一次、写入两处。
- **Domain 与协议**: `src/core/events.ts`、`src/ui/shared/types.ts`、`src/ui/web/web-backend.ts` 增加 typed 投影。
- **TUI**: `src/ui/tui-backend.ts` 在 completed event 后打开可信 compatibility path。
- **Web frontend**: `App.tsx`、`EvalDashboardView.tsx`、`ArtifactContainer.tsx`、`MessageInput.tsx` 和 Eval cache/state utilities 实现独立只读视图。
- **Session switching**: `src/core/harness.ts` 和 `tests/core/session-switching.test.ts` 修复项目索引与受限全局索引的解析差异。
- **安全边界**: 不提供 `~/.dscode/eval` 静态目录，不接受客户端文件路径，不执行 iframe 脚本，不把 Eval HTML 写入 Main Agent transcript。
- **兼容性**: Session Dashboard 的可编辑 artifact、20 条 contentHash cache、Chat transition，以及 TUI 输出路径保持不变。
