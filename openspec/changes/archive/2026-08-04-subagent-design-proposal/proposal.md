## Why

dscode 当前只有一个由 `Harness` 持有的 `pi-agent-core.Agent` 实例。复杂任务的探索、实现、审查和验证共享同一上下文与工具状态，导致上下文膨胀、职责混杂，也无法把独立工作作为可管理的运行单元并发执行。

本变更引入操作系统风格的 Agent 模型：**Agent 是进程，Agent 配置是 Application，Main Agent 是 PID 1 管理进程，SubAgent 是由 Main Agent 启动的子进程，Session 是进程连接的用户终端。** 同一套进程模型同时适用于 Main Agent 和 SubAgent，不再为子代理建立平行运行时。

## What Changes

- 新增 `AgentApplication`：描述可启动应用的系统提示、工具、Skills、模型、权限、预算、MCP、Memory、默认挂载方式与隔离方式。
- MVP 仅将 Vision 作为 Bundled Agent.md 提供，即 `vision.md`。Main Agent 和其他既有角色保持原实现，不在本变更中迁移为 Agent.md。
- Bundled Agent.md SHALL 位于顶层 `resources/agents/`，不放在 `src/`。构建生成带版本和 SHA-256 的资源 manifest，并将资源放入唯一 npm release staging 的 `dist/resources/`。
- npm SHALL 使用单一 fat package 发布 CLI 与产品资源；GitHub Actions 构建、验证、上传并发布同一个 tgz，支持 Trusted Publishing/OIDC 和 provenance。
- 新增 Claude Code Agent 配置兼容层：
  - 兼容 Markdown + YAML frontmatter；
  - 加载 `~/.claude/agents/`、`<project>/.claude/agents/`；
  - 将 Claude Code 工具名、模型别名和权限模式编译为 dscode 运行能力；
  - 对不支持或无法映射的字段给出显式诊断。
- 新增 `Agent` 领域进程模型。`pi-agent-core.Agent` 在代码中作为 `PiAgentRuntime` 使用，只负责模型与工具循环。
- 新增 `AgentSupervisor` 和 Agent Process Table，管理 PID/PPID、进程状态、前后台挂载、信号、Usage、转录与退出结果。
- Agent 进程 SHALL 保存启动时的不可变 Application 快照、来源、digest 和 Registry generation；Agent.md 热更新只影响后续启动或重新进入的模式。
- 所有 SubAgent SHALL 使用同一 PiAgentRuntimeAdapter 执行链。Vision 与其他 SubAgent 的差异只来自 Agent.md 的 Prompt、model、空工具能力和 fallback 配置。
- `spawn` SHALL 接受通用输入信封 `AgentProcessInput`，图片、文件和文本都表示为 Attachment，不在进程 API 中增加 Vision 专用参数。
- `context_mode: selected` SHALL 使用类型化 `ContextSelection` 显式引用父消息、工具结果、文件和 Diff；ContextAssembler 负责校验、预算、不可变快照和 Prompt 注入，且不得借此扩大权限。
- Vision SHALL 作为 SubAgent 系统首个端到端验收对象：用户图片与 MCP 图片均通过 AgentSupervisor 创建普通 Vision Agent；PiAgentRuntime 失败后，执行引擎依据 `vision.md` 的 fallback 策略调用受信任 OCR Handler。
- Vision 验收 SHALL 先恢复现有 Pipeline 测试基线；当前测试 mock 缺少 ImageCache.get，9 个用例在业务断言前失败，必须作为 Gate 0 修复而不能带入迁移。
- Main Agent 作为 PID 1 进程，通过标准工具启动、查询、通信、等待和终止子进程。
- Session 保持用户会话/TTY 语义，不把 SubAgent 注册成普通用户 Session；子进程通过 `parentSessionId` 连接父 Session。
- 新增 `AsyncLocalStorage` 执行环境，隔离 `agentId`、`parentAgentId`、`cwd`、权限、挂载模式和调用深度。
- 新增前台与后台执行：
  - foreground 等待同一子进程退出；
  - background 立即返回 PID，同一子进程继续运行；
  - 前台转后台只改变 attachment，不重启 Agent。
- 新增进程生命周期事件、结构化退出结果、进程间消息、停止、强制终止与输出查询。
- 工具和权限采用 capability 派生：父级 deny 与路径边界不可被子应用放宽，后台进程不得等待隐藏的权限交互。
- 新增 Worktree 隔离，写能力后台 Agent 默认要求独立 Worktree。
- Fork 保留显式 `context_mode: "fork"` 协议位，但在后续 Eval 通过前拒绝执行。
- Agent Memory、Agent 专属 MCP、Fork、checkpoint restore 属于后续增强，不阻塞同步 SubAgent MVP。
- 移除旧方案对 Claude Code 内部 `QueryEngine`、`AppState`、Task Registry、Zod 和 `.claude` 存储路径的直接依赖。

## Capabilities

### New Capabilities

- `agent-definition`: AgentApplication 数据模型、Bundled Agent.md、来源优先级、Claude Code 配置兼容、快照与编译诊断。
- `agent-context`: 基于 AsyncLocalStorage 的进程身份、执行环境与并发隔离。
- `agent-execution-engine`: Agent 进程、AgentSupervisor、Process Table、状态机和 AgentProcessRuntime 创建。
- `agent-tool`: Main Agent 使用的进程工具协议，包括 spawn/list/wait/output/TERM/KILL/STOP/CONT/IPC。
- `agent-tool-filtering`: Application 工具编译、能力派生、权限单调收窄和递归控制。
- `agent-progress-notification`: Agent 生命周期事件、进度、退出状态和父进程通知。
- `agent-resume`: 活进程 IPC、停止/继续和终止语义。
- `agent-isolation`: 并发安全 cwd、Worktree 和写进程隔离。
- `agent-memory`: 兼容 Claude Code memory 字段的 Application 级持久记忆。
- `vision-subagent-acceptance`: 通用 Vision Agent、图片 Attachment、PiAgentRuntime、OCR fallback 和端到端验收标准。
- `package-resource`: 顶层资源目录、manifest 完整性、release staging、npm tarball 验证和 GitHub Actions 发布。

### Modified Capabilities

<!-- 无。现有同名主规格尚未由本变更实现；本 change 继续作为这些 capability 的实现来源。 -->

## Impact

- `src/core/harness.ts`：主 Agent 由 AgentSupervisor 创建和管理，保留兼容访问入口。
- `src/core/events.ts`、`src/core/harness-api.ts`：增加进程事件和进程管理 API。
- `src/session/*`：Session 继续表示用户会话，仅增加父进程关联所需的非侵入式查询接口。
- `src/drivers/*`：注册进程工具；文件、Shell、Checkpoint 从 AgentContext 解析 cwd。
- `src/permissions/*`：增加权限派生和后台非交互策略。
- `src/skills/*`、`src/mcp/*`：Application 编译时解析 Skills 与 MCP capability。
- 新增 `src/agents/`，按 Application、Process、Supervisor、Store、Context、Compatibility 分职责组织，每个 TypeScript 文件不超过 300 行。
- 新增 `resources/agents/vision.md` 和资源 catalog；`scripts/build.mjs` 校验资源并生成 release manifest。
- 新增 `PackageResourceProvider`，生产运行时只从 module-relative `dist/resources/manifest.json` 加载 Bundled Application。
- `release/package/` 成为唯一 npm 发布 staging；仓库根 package 禁止直接发布。
- `.github/workflows/publish.yml` 打包、验证并发布同一个 tgz，不在 publish job 重新打包。
- `src/drivers/vision/*`、`src/core/harness.ts`、`src/mcp/manager.ts`：图片缓存/压缩作为 Attachment 基础设施，OCR 作为失败恢复 Handler；结果按 parentSessionId 回传并保留原生多模态直通路径。
- `tests/agents/*`、`tests/drivers/vision/*`：新增确定性 Vision SubAgent 集成验收和可选真实 Provider smoke test。
- 配置来源增加 `.dscode/agents/` 与 Claude Code 兼容目录，但不改变 `.dscode/commands/`、`.dscode/skills/` 的既有优先级规则。
- Session 文件格式保持兼容；Agent Process Store 使用独立版本化格式。
