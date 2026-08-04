## 变更综述

Session 切换从最初的项目级持久化与错误校验，经历了流式处理中直接加载导致消息丢失、当前 Session 重复点击重置、权限提示无法跨 Session 恢复、长 turn 保存窗口，以及 SubAgent 引入后的跨 Session 路由问题。最终由 `Harness.switchSession()` 建立 UI 无关、可等待、可回滚的唯一事务边界，以 prepare/commit 两阶段加载、Main turn quiescence、Main Process 原子重绑定和 `parentSessionId` 不可变路由统一 TUI、Web slash 与 Web 侧边栏。

## 变更时间线

- 2026-01-16: `fix-session-not-found-on-load` — 修复空的当前 Session 因列表过滤而无法加载。
- 2026-05-28: `session-management-overhaul` — 建立项目级 Session、文件校验、原子写入和 TUI/Web 丰富展示。
- 2026-06-16: `fix-session-switch-loss` — 首次在加载前引入 abort + save，避免流式输出被写入目标 Session。
- 2026-06-16: `fix-session-click-reset-during-processing` — 阻止处理中点击当前 Session 破坏前端 conversation。
- 2026-06-16: `session-permission-pause-resume` — 用 `pendingPermission` 保存被切换中断的权限提示。
- 2026-07-16: `session-auto-save` — 增加 pre-turn 与周期保存，缩小长 turn 的数据丢失窗口。
- 2026-08-04: `subagent-design-proposal` — 确立 Session 即 TTY、Agent 即 Process，以及 SubAgent 的 `parentSessionId` 路由。
- 2026-08-04: `unify-session-switching` — 将分散入口收敛为原子、可等待、可回滚的统一切换事务。

## 初始设计

`session-management-overhaul` 将 Session 从全局平面列表改为按项目组织的持久化对象，并增加：

- Session 文件结构与 metadata 校验；
- tmp → rename 原子写入；
- `projectPath`、模型、创建/更新时间和 preview；
- TUI 与 Web 一致的列表、加载和错误展示。

这一阶段的核心目标是“可靠地找到并恢复一个 Session”。加载仍由各 UI 入口直接编排，尚未定义跨 Main turn、权限状态和 Agent Process 的事务语义。

## 变更记录

### 变更: 加载前保存源 Session
- **触发**: Web 在 Session A 流式输出时直接加载 B，会覆盖 Main messages，A 的后续输出进入 B。
- **改动**: `fix-session-switch-loss` 在加载前执行 abort 和 save，并同步刷新 Session 列表。
- **影响**: 初步建立了“先终止并保存，再加载”的顺序，但逻辑仍复制在 Web 与 slash command 中。

### 变更: 权限状态成为 Session 数据
- **触发**: 权限弹窗期间切换后，源 Session 留下未完成 tool request，切回时无法理解或继续。
- **改动**: `session-permission-pause-resume` 在 metadata 中增加结构化 `pendingPermission`，保存干净 Main messages 并在恢复后重新展示权限提示。
- **影响**: Session 保存范围扩展到交互状态，但 UI 私有 permission 状态仍参与各入口编排。

### 变更: 扩充保存时机
- **触发**: 长时间 streaming、工具循环或强制退出会扩大未保存窗口。
- **改动**: `session-auto-save` 增加 user message 后的保存点和 15 秒 dirty 保存。
- **影响**: 降低一般运行时数据丢失风险；显式 Session 切换仍需事务内的最终源 Session 保存。

### 变更: Session 与 Agent Process 分离
- **触发**: SubAgent 引入后，Session 加载不仅恢复 Main messages，还会影响新子进程的归属与旧后台 Agent 的结果路由。
- **改动**: `subagent-design-proposal` 定义 Session 为 TTY、Main/SubAgent 为 Process；SubAgent 在 spawn 时固定 `parentSessionId`，完整记录进入 Process Store，轻量记录进入父 Session 的 `agentMessages`。
- **影响**: Session 切换必须只重绑定 Main Process，不能迁移已有 SubAgent，也不能把 SubAgent transcript 注入 Main 推理上下文。

### 变更: 统一可等待事务
- **触发**: TUI slash、Web slash 与 Web typed load 分别执行解析、abort、save、load 和 UI 刷新；`session:loaded` 事件中的 Main 重绑定不可等待且无法传播持久化失败。
- **改动**: 当前变更新增 `Harness.switchSession()`、两阶段加载、Main turn Promise 跟踪、切换互斥门和原子 Main Process 重绑定。
- **影响**: 三个入口只负责适配输入与完成后渲染；核心层成为唯一正确性边界。

## 修复记录

### 修复: 空的当前 Session 无法加载
- **症状**: `listSessions()` 过滤 `messageCount === 0` 后，侧边栏可见的当前空 Session 返回 not found。
- **根因**: 展示列表与加载目标解析使用不同数据来源。
- **修复**: 早期方案为 Web fallback 到 current metadata；最终统一解析同时考虑全量索引与当前 metadata，再由 prepare 验证磁盘快照。

### 修复: 处理中点击当前 Session 重置 conversation
- **症状**: 当前 Session 的流式、thinking 和 tool result 被前端清空。
- **根因**: UI 将当前 Session 点击也当作 load。
- **修复**: 先在前端增加处理中点击保护；最终所有真实加载必须等待统一事务完成后才 clear、replay 和 ready。

### 修复: Main Process 重绑定失败污染内存
- **症状**: Process Store 写入失败时，Main Process 内存可能已指向目标 Session，而 SessionManager 仍在源 Session。
- **根因**: `updateParentSession()` 先修改内存，持久化错误被 lifecycle 吞掉。
- **修复**: 关键写入使用可抛错的持久化路径；失败时恢复旧 `parentSessionId` 和不可变 AgentContext，禁止目标 commit。

### 修复: 旧后台 Agent 结果误入新 Session
- **症状**: Main Agent 切换到 B 后，A 启动的后台 Agent 可能被误认为属于 B。
- **根因**: Main TTY 重绑定与既有子进程归属缺少明确边界。
- **修复**: 重绑定只操作指定 Main Process；既有 SubAgent、Process Store 记录和 notification 路由键不变，退出结果继续按 A 写回。

## 最终状态

### Why

TUI `/session load`、Web `/session load` 和 Web 侧边栏加载此前分别编排 Session 切换，导致保存、中止、异步等待、Main Agent Process 重绑定和 UI 刷新顺序不一致。SubAgent 通过 `parentSessionId` 关联 Session 后，这种分叉会造成新子进程归属错误、旧会话状态丢失或 Web 提前刷新。

### What Changes

- 新增 UI 无关的 `Harness.switchSession()`，作为三个加载入口的唯一事务边界。
- 在中止当前 Main turn 前解析唯一目标并完成 `SessionManager.prepareLoad()`。
- 跟踪 Main turn Promise，abort 后等待真实静止，不使用固定 sleep。
- 在目标 commit 前保存源 Session 的 Main messages、metadata、`agentMessages` 和可选 `PendingPermission`。
- 显式 await Main Agent Process 的 `parentSessionId` 与 AgentContext 持久化；失败时回滚并保持源 Session。
- 使用 `commitPreparedLoad()` 无 I/O 地恢复目标 Main messages 和独立 `agentMessages`，随后发布 `session:loaded` 完成通知。
- 保持运行中 background SubAgent 的原始 `parentSessionId`；load 不 spawn、不恢复 Agent Process。
- 增加核心切换互斥门，拒绝并发切换和切换期间的新 prompt。
- 将 slash command 协议改为 Promise，TUI 与 Web 均等待完成后再重建 conversation、刷新列表、隐藏 loader 或发送 ready。

### Capabilities

- **新增 `session-switching`**：统一目标解析、切换事务、入口一致性、失败回滚和跨 Session SubAgent 路由。
- **修改 `session-management`**：增加 prepare/commit、源 Session 完整保存、legacy Vision 迁移和 `agentMessages` 隔离。
- **修改 `agent-execution-engine`**：Main Agent Process 原子重绑定 TTY，既有 SubAgent 归属保持不变。

### Impact

- `src/core/harness-api.ts`、`src/core/harness.ts`：统一切换 API、互斥门和 Main turn quiescence。
- `src/session/`：Prepared snapshot 与两阶段加载。
- `src/agents/process/`：可传播失败的关键持久化与内存回滚。
- `src/ui/commands.ts`、`src/ui/tui-app.ts`、`src/ui/web/web-backend.ts`：异步 command 和统一入口适配。
- `tests/session/`、`tests/core/`、`tests/agents/`、`tests/ui/`：无副作用、事务顺序、失败回滚、路由和入口一致性覆盖。
- Session Store 与 Agent Process Store 的物理目录不变，不需要磁盘迁移。
