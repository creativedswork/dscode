## 变更综述

dscode 的架构演进先后解决了 Harness 与 UI 的通知耦合、TUI/Web 模型漂移、
SubAgent 进程建模、Session 切换事务和 Open Design 生命周期侵入等局部问题，但这些
改造也留下了新的公共边界债务：HarnessEventBus 具体实现和所有 Manager 被暴露给 UI，
共享 UI DTO 被 Runtime/Session 反向引用，配置写入分散，Open Design typed config 仍位于
Core。`restore-architectural-boundaries` 将这些局部抽象收敛为可执行的整体分层：
Bootstrap 负责具体组装，Kernel 提供 EventBus/ExecutionContext ABI，Application 只公开
Commands/Queries/Events，各领域拥有自己的类型与配置，Presentation 负责投影和渲染，
并以 TypeScript AST 检查持续执行依赖方向。同时，标准运行能力被收敛为无 CLI
副作用、实例状态隔离的 Agent Host，为未来 SDK 复用相同 feature set 提供基础。

## 变更时间线

- 2026-01-16: `harness-event-bus` — 用 typed event bus 替代 Harness 对 40+ UI 通知方法的直接调用。
- 2026-05-27: `permission-save-project-settings` — 权限规则改为项目级持久化，但 PermissionManager 直接依赖配置 I/O。
- 2026-05-29: `shared-ui-data-model` — 建立 TUI/Web canonical UI model，消除双端类型漂移。
- 2026-06-01: `code-maintainability-refactor` — 引入 HarnessAPI 和 SlashCommandContext，但以公开 Manager 的 Service Locator 方式消除 `as any`。
- 2026-06-16: `fix-session-switch-loss` — 在 Web handler 内补充 abort/save/load 顺序，暴露 UI 编排应用事务的问题。
- 2026-06-20: `fix-context-window-refresh-on-session-switch` — 修复 UI 私有 Session 路径遗漏状态通知的问题。
- 2026-06-30: `extract-mcp-config-to-dotfile` — 将 MCP 基建配置从 settings 偏好中分离，但加载和切换仍集中在 Core/Harness。
- 2026-08-04: `subagent-design-proposal` — 建立 Agent Process、AgentSupervisor 和 AsyncLocalStorage AgentContext。
- 2026-08-04: `unify-session-switching` — 将三条 Session 加载路径收敛为 UI 无关事务用例，形成正确 Application 边界范例。
- 2026-08-05: `systematize-agent-os-mapping` — 在文档中区分 Application、Process、Syscall、Driver 和 Resource。
- 2026-08-09: `decouple-open-design-from-core` — 引入 Integration 与 ServiceSupervisor，移除 daemon 生命周期侵入，但具体配置类型仍泄漏到 Core。
- 2026-08-09: `restore-architectural-boundaries` — 将历史局部抽象统一为 owner-defined contracts、Application facade、SettingsService、Presentation boundary 和 SDK-ready Agent Host。

## 初始设计

最初的可维护性方向主要解决“调用太多”和“双端重复”：

- HarnessEventBus 将流式输出、Tool、Session、Config 和 MCP 状态变成统一事件；
- UiBackend 缩减为生命周期与权限交互接口；
- `src/ui/shared/` 成为 TUI/Web 的 canonical 展示模型；
- HarnessAPI 代替 TuiDeps，把 Agent、Manager、Registry、ConfigWatch 和修改方法集中暴露；
- SlashCommand 使用 `{ harness, ui }`，不再依赖 TuiApp；
- ConfigWatch 为共享 HarnessConfig 提供 setter 与通知。

这些设计有效消除了部分重复和私有字段 cast，但抽象边界仍以“让外层能访问内部对象”为
目标。随着 SubAgent、Eval、MCP App、Open Design、项目切换和更多配置命令加入，
HarnessAPI 演化为 Service Locator，Core 也演化为类型仓库和具体工作流集中点。

## 变更记录

### 变更: EventBus 从 UI 解耦工具升级为 Application 事件端口
- **触发**: 具体 HarnessEventBus 及其 UI DTO payload 被公开，Core Events 反向 import UI 类型。
- **改动**: 分离内部 publisher 与外部 subscribe-only source；payload 由 Agent、MCP、Eval、Session 等语义所有者定义。
- **影响**: 保留事件 type、顺序和 TUI/Web 行为，移除非 Presentation 对 UI DTO 的依赖。

### 变更: HarnessAPI 从 Service Locator 改为 Command/Query/Event facade
- **触发**: UI 和 Slash Command 可直接修改 `agent.state`、调用 Manager、操作 ConfigWatch，绕过事务与校验。
- **改动**: HarnessAPI 按 Conversation、Session、Settings、Tool、Skill、Agent、Eval、Project 能力聚合窄端口，只返回不可变 snapshot。
- **影响**: 内部 TypeScript API breaking；用户 CLI、wire protocol 和行为不变。

### 变更: 类型回归语义所有者
- **触发**: `core/types.ts` 同时定义 Integration、Driver、Skill、Command、Memory、Permission、Vision 和 UI 交互类型。
- **改动**: 每个模块导出自己的 public contract；Core compatibility re-export 仅用于迁移并由架构检查阻止新增依赖。
- **影响**: 新增 feature 不再编辑中央类型表，依赖方向可以静态检查。

### 变更: 配置拆分为 Repository、typed resolver、Service 和 Runtime Snapshot
- **触发**: UI、Permission、Harness 和 Integration 分别执行文件读写、merge、校验和运行时 mutation。
- **改动**: SettingsRepository 只负责 scoped I/O；所有者负责 typed resolver；SettingsService 执行安全 patch；RuntimeConfigStore 发布不可变 snapshot。
- **影响**: `settings.json` 仍是持久 SSoT，`.mcp.json` 和兼容环境入口保持原契约，不引入第二配置源。

### 变更: Open Design 配置完全归 Integration
- **触发**: daemon 生命周期已迁出 Core，但 `OpenDesignIntegrationConfig` 和 resolver 调用仍存在于 Core types/config。
- **改动**: Integration 注册同时绑定 typed resolver；IntegrationRegistry 提供 raw scopes 和 override，Core 不枚举设备字段。
- **影响**: 新 Integration 不需要修改 HarnessConfig 或 Core config loader。

### 变更: Session/Runtime 数据与 Presentation projection 分离
- **触发**: Session types、Agent Runtime、Eval、MCP 和 Core Events import `src/ui/shared` formatter、projection 或 DTO。
- **改动**: 领域层输出原始稳定记录；纯 Presentation projector 统一处理 live events 与 persisted snapshots。
- **影响**: TUI/Web 继续共享 canonical model，但该 model 不再向内渗透到持久化和 Runtime。

### 变更: AgentContext 提升为 Kernel Execution Context ABI
- **触发**: Driver、Logger、Checkpoint 需要 cwd/归因，却依赖 `agents/process` 的具体目录。
- **改动**: Kernel 提供最小 ExecutionContext AsyncLocalStorage ABI；AgentSupervisor 在 Runtime 入口绑定，PCB 保留 Agent-specific state。
- **影响**: 保持并发 cwd 与 Worktree 隔离，Driver 不读取 Agent Process Table。

### 变更: Harness 收敛为生命周期协调器
- **触发**: Harness 超过 2000 行，同时构造组件、选择 UI、处理 Session/项目/MCP/Vision/Agent 流程。
- **改动**: Bootstrap 负责具体组装；Conversation、Session、Project、MCP、Agent Runtime 和 Settings Coordinator 各自拥有事务。
- **影响**: Harness 仍是 Application host，但不再是 Composition Root、Presenter 和所有 feature workflow 的合集。

### 变更: 标准运行时形成 SDK-ready Agent Host
- **触发**: CLI 是唯一 Composition Root，Application 仍修改 process cwd/env 并依赖模块级可变状态，无法在同一进程安全嵌入多个 Runtime。
- **改动**: 分离 `AgentDefinition` 与编译快照；引入无 UI 的 `createStandardAgentHost()`；状态归属 Host；signals、process exit、cwd/env 适配留在 CLI。
- **影响**: CLI/TUI/Web 与未来嵌入方可复用同一标准 feature composition，但本变更不发布 SDK 或第三方 plugin SPI。

## 修复记录

### 修复: Session 切换的数据丢失与状态遗漏
- **症状**: Web/TUI 不同路径分别执行 abort/save/load，曾导致当前输出丢失、状态串入目标 Session 和 context bar 不刷新。
- **根因**: Presentation adapter 直接编排 SessionManager 和 Agent state，缺少统一事务入口。
- **修复**: 沿用 `unify-session-switching` 的正确方向，将所有 Session 操作收口到 Application command；UI 只提交请求并渲染结果。

### 修复: 配置更新可能绕过校验或丢失并行字段
- **症状**: UI、Skill toggle 和 PermissionManager 各自执行 read-merge-write 与 ConfigWatch mutation。
- **根因**: 缺少 scoped atomic patch 和唯一 SettingsService。
- **修复**: 集中原子 patch、typed validation、runtime apply 与 change event，并增加并发不同字段更新测试。

### 修复: 架构文档与实现不能相互约束
- **症状**: 文档声明 Layer 只能依赖内层，但仓库没有自动检查；历史 spec 甚至明确要求公开 Manager。
- **根因**: 分层停留在命名和 OS 类比，没有机器可执行规则。
- **修复**: 建立 TypeScript AST dependency checker、精确 Composition Root 例外和迁移 ratchet；同步修改冲突 specs。

## 最终状态

### Why

dscode 的模块职责已经清晰到足以形成真正边界，但 Core type bag、Harness Service
Locator、分散配置写入和 Runtime→UI 反向依赖使边界无法执行。随着 Integration、
SubAgent、Eval 和双 UI 继续增长，必须在新增具体设备类别之前恢复可扩展的所有权模型，
并避免把 CLI-only 与单 Runtime 假设固化为未来 SDK 无法跨越的内部约束。

### What Changes

- 建立 owner-defined contracts 与自动化 dependency rules；
- 将 `core/types.ts` 中的 feature 类型迁回所有者；
- 将 HarnessAPI 改为 Commands、Queries、Events 和 immutable snapshots；
- 引入 SettingsRepository、SettingsService 与 RuntimeConfigStore；
- 让 Integration 自己拥有 typed config 和兼容解析；
- 将领域/持久化记录与 Presentation projection 分离；
- 将 Execution Context 提升为 Kernel ABI；
- 将 Harness 工作流拆入 Coordinator，具体构造和 UI 选择移至 Bootstrap；
- 分离 `AgentDefinition` 与 Runtime snapshot，提供标准 Agent Host 构造和独立生命周期；
- 消除 Application/Feature 的 process cwd/env mutation 与跨 Host 模块级可变状态；
- 保持现有 CLI、配置格式、Session schema、wire protocol 和用户交互。

### Capabilities

#### New Capabilities

- `module-boundary-contracts`: 类型所有权、依赖矩阵、Composition Root 例外和 AST 检查。
- `settings-service-boundary`: scoped repository、typed resolver、安全 patch 和 runtime snapshot。
- `runtime-presentation-boundary`: 领域事件、持久化快照和 TUI/Web projection 的单向边界。
- `agent-sdk-readiness`: 可复用标准 Agent Host、定义编译边界、feature parity、实例隔离和 CLI 副作用边界。

#### Modified Capabilities

- `harness-api`、`core-harness`、`config-watch`、`harness-event-bus`；
- `ui-backend-slim`、`slash-command-context`、`shared-conversation-model`；
- `open-design-env-config`、`agent-context`、`image-session`；
- `permission-project-persist`、`session-management`、`architecture-documentation`。

### Impact

- 内部 TypeScript API、import path、构造方式和测试 fixture 将发生 breaking change；
- `src/core/`、各 feature owner、`src/ui/`、配置与测试工具均受影响；
- 不新增运行时依赖，不修改用户配置格式或持久化 schema；
- 不发布 npm SDK、不新增 library exports、不承诺 public SemVer 或第三方 Feature SPI；
- 通过十一阶段任务、兼容 re-export 和架构 baseline ratchet 渐进实施；
- 完成条件包括零违规 baseline、双 Host 隔离、full test、package build、TUI/Web smoke 和 strict OpenSpec validation。
