## 1. Eval 生命周期与呈现边界

- [x] 1.1 在 Harness events 中定义 `EvalDashboardState` typed union 和 `eval:dashboard` domain event，覆盖 starting/running/completed/failed、requested/target Session、run、stage、Application、worker 和 HTML/error 字段
- [x] 1.2 调整 Dashboard 生成接口，使 coordinator 可用同一份 HTML 原子写入 run-local 与兼容路径并发布 completed event，不重复生成或调用模型
- [x] 1.3 在 Web `/eval` command 第一个 `await` 前同步发布 starting event，再将 CHIEF progress、完成和异常路径映射为 lifecycle events，确保 required-stage failure 不发布 partial completed HTML
- [x] 1.4 从 `runEval()` 移除无条件 `openDashboard()`，在 TUI event subscriber 中打开 completed event 的可信 output path
- [x] 1.5 增加 lifecycle 顺序、历史 target identity、失败保留成功文件和 TUI 外部打开的单元测试

## 2. WebSocket 协议与 WebBackend 投影

- [x] 2.1 在 shared `ServerEvent` 中增加 `eval_dashboard` discriminated union，并保持现有 `artifact_start/delta/end` 协议不变
- [x] 2.2 在 WebBackend 订阅 `eval:dashboard`，将 domain event 投影为 typed WebSocket event 并保留当前 broadcast 语义
- [x] 2.3 确保 completed Web event 只使用 coordinator 提供的 HTML，不增加 `~/.dscode/eval` 静态目录或客户端文件路径读取
- [x] 2.4 增加 starting-before-async、running/completed/failed payload、无 arbitrary-path command 和 HTML 精确传递的协议测试

## 3. WebUI 独立 Eval 视图

- [x] 3.1 新增共享 `ViewMode = "chat" | "session_dashboard" | "eval_dashboard"`，拆分 Session Dashboard 与 Eval 的 HTML、loading、identity 和 lifecycle state
- [x] 3.2 处理 `eval_dashboard` 事件：starting 时立即自动跳转 Eval preparation、按 run ID 抑制 stale events、running 更新长时进度、completed 原子显示报告、failed 显示阶段诊断
- [x] 3.3 按原型实现 shell-level `Chat / Dashboard / Eval` selector 和 Eval-only 主区域，覆盖 target/run/evidence toolbar、elapsed timer、active worker/retry、七阶段 running state 和 failed recovery state
- [x] 3.4 扩展 ArtifactContainer presentation descriptor，复用 `iframe.srcDoc` 和 `sandbox="allow-same-origin"`，明确禁止 `allow-scripts`
- [x] 3.5 在 Eval 模式隐藏 MessageInput 并显示 read-only footer；保留 Session Dashboard 的 pure-instruction `artifact update` 行为
- [x] 3.6 实现 Eval 外部打开的 Blob URL 行为，不向后端发送本地路径；释放不再使用的 object URL
- [x] 3.7 调整 Session 切换和 empty-session effects：Session Dashboard 重置为 Chat，Eval 保持原 target/run identity，初次 Session assignment 不误重置
- [x] 3.8 对齐原型的 light/dark tokens、窄屏 selector、折叠 sidebar/toolbar labels 和无水平溢出布局

## 4. Eval Dashboard 缓存

- [x] 4.1 新增独立 `dscode-eval-dash-cache` utility、format version 和 `${targetSessionId}:${runId}` immutable key，不修改 `dscode-dash-cache`
- [x] 4.2 实现最多五条的最近访问淘汰、损坏/旧版本 normalization、reload 恢复 latest Eval artifact
- [x] 4.3 仅在 completed event 写缓存；running/failed event 保留 latest successful report并提供重新打开入口
- [x] 4.4 增加 Session/Eval cache 隔离、多 run 同 target、failure preservation、LRU limit 和版本失效测试

## 5. 交互与回归验证

- [x] 5.1 增加 Web reducer/App 测试，覆盖 prompt `/eval` 即时跳转、三种 ViewMode、starting/running/terminal 状态机、stale run、历史 target、Session switch 和无 Eval input
- [x] 5.2 增加 ArtifactContainer sandbox、Blob external-open、HTML escaping/error text 和 no-regeneration 测试
- [x] 5.3 验证普通 Session Dashboard 的 cache hit、Chat transition、artifact update 和 20-entry cache 行为保持兼容
- [x] 5.4 使用 fake Eval lifecycle 在 WebUI 浏览器验证 starting/running/completed/failed、Eval-only 主区域、长时 timer/worker/retry、自动跳转、亮暗主题和窄屏布局
- [x] 5.5 运行 eval、WebUI、TUI、shared protocol 和 Session tests，以及 `npm run typecheck`、`npm run build`

## 6. Eval 入口与主区域布局修正

- [x] 6.1 更新 proposal、design、spec、prototype 和 consolidate，明确 Eval selector 始终可见，以及 lifecycle 页面占满 Chat 主区域
- [x] 6.2 调整 Header：无 Eval lifecycle/cache 时仍渲染 Eval 按钮，并避免直接进入空白视图（直接触发语义由 7.2 承接）
- [x] 6.3 调整 Starting/Running/Failed 布局，移除 610px 中央小卡片约束，使用与 ChatView 一致的主区域 gutter 并铺满可用宽高
- [x] 6.4 增加 selector availability 与 full-surface 布局测试，使用 fake lifecycle 浏览器复验默认/Running，并运行 typecheck、build

## 7. Eval selector 直接触发

- [x] 7.1 修订 proposal、design、spec、prototype 和 consolidate：无 lifecycle/cache 时 Eval selector 直接发送 `/eval`
- [x] 7.2 使 Eval 按钮默认可点击；首次点击复用标准 slash command，已有 Eval state 时保持视图切换语义
- [x] 7.3 增加 selector dispatch 回归测试和 fake lifecycle 浏览器验证，并运行 typecheck、build、OpenSpec strict validation

## 8. 缓存报告下重新触发 Eval

- [x] 8.1 修订交互规格：无状态、Completed 或 Failed 点击 Eval 均启动当前 Session 新 run，仅 Starting/Running 防重复
- [x] 8.2 移除 Completed/cache 的 selector 短路并增加状态矩阵测试
- [x] 8.3 在预置 Completed cache 的浏览器场景验证点击发送 `/eval`、进入新 Starting/Running，并运行完整校验

## 9. Eval 生命周期页面可读性

- [x] 9.1 提升 Eval toolbar、生命周期正文、运行统计、worker、阶段行和只读栏字号，并同步更新交互原型
- [x] 9.2 增加关键字号回归测试，验证桌面 Running 页面无横向溢出，并运行专项测试、typecheck 和 Web 构建

## 10. 失败时回退同目标完整报告

- [x] 10.1 修订 proposal、design、spec 和 prototype：Failed 保持失败语义，只自动展示同一目标 Session 最新完整成功报告，无匹配时显示空白失败页
- [x] 10.2 按 `targetSessionId` 与 `generatedAt` 选择回退报告，移除全局最近报告入口，并显示失败 run、历史 run 和错误摘要
- [x] 10.3 增加同目标自动回退、跨目标隔离和无匹配空白页测试，并运行 Eval lifecycle/UI/cache 测试与 typecheck

## 11. Session Dashboard 入口约束

- [x] 11.1 修订 proposal、design、spec、prototype 和 consolidate：Session Dashboard 只能从非空 Chat 显式进入
- [x] 11.2 在 Eval 中禁用 Dashboard，并在 App handler 与转场提交处拒绝非 Chat 来源
- [x] 11.3 增加来源判定与 selector 状态测试，并运行 ViewMode/Eval UI 测试、typecheck、Web 构建和 OpenSpec strict validation

## 12. 项目 Session 解析一致性

- [x] 12.1 新增 `session-switching` delta，明确目标预检合并项目索引、受限全局索引和 current metadata，并按完整 ID 去重
- [x] 12.2 在统一 `switchSession()` 入口加入项目 Session 候选，保持不存在与前缀冲突时无副作用
- [x] 12.3 增加全局索引淘汰后的项目 Session 回归测试，并同步 proposal、design 和 consolidate

## 13. Eval 报告 iframe 高度

- [x] 13.1 修正 Eval 内容槽的 flex 布局，使 Completed 与失败历史报告占满 toolbar/footer 之间的剩余高度
- [x] 13.2 增加 Completed 报告容器结构回归测试，并使用真实 `3e6b66` artifact 验证报告 HTML 完整
- [x] 13.3 同步 proposal、design、spec、prototype 和 consolidate，并运行专项测试、typecheck、Web 构建和 OpenSpec strict validation
