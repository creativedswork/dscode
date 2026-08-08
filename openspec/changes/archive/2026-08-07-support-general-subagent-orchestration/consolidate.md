## 变更综述

dscode 的 SubAgent 能力从统一 Agent Process 模型开始，先以 Vision 验证声明式 Agent.md 和
统一 Runtime，再由 CHIEF Eval workers 验证多个专业 Application 可以复用同一执行链。本次
变更补上通用 Skill 编排所需的最后一块基础能力：内置 fresh `general` Application，并让
Main Agent 能看到 Registry 已发现的专业 Agent，从而由 Skill 动态定义逻辑角色而不把业务
任务图写进 Harness。

## 变更时间线

- 2026-08-04: `subagent-design-proposal` — 建立 Application、Process、Supervisor、统一 Runtime
  和 Agent.md Registry，并以 Vision 作为首个端到端验收对象。
- 2026-08-05: `adapt-eval-to-subagents` — 将 CHIEF 阶段迁移为多个声明式专业 Application，
  验证同构 worker 和 process-only 编排。
- 2026-08-07: `support-general-subagent-orchestration` — 增加 `general` 回退和 Registry catalog
  可见性，使可移植 Skill 能组合已有专业 Agent 与动态通用角色。

## 初始设计

初始 SubAgent proposal 将 Agent 定义为受 Supervisor 管理的进程，将 Agent.md 定义为
Application 描述符，并要求所有 SubAgent 共享 PiAgentRuntimeAdapter 执行链。它同时建立了
父子进程、fresh/selected context、capability 单调收窄、前后台挂载、Worktree 隔离和 package
resource 完整性规则。

MVP 有意只内置 Vision，并明确把通用 Agent 和 Fork 延后，以便先用边界清晰的图片任务验证
架构。这个选择保证了底层模型正确，但留下了一个产品缺口：只描述“多个 SubAgent 分工”的
Skill 没有通用 Application 可用，也无法可靠知道项目已经提供哪些专业 Agent.md。

## 变更记录

### 变更: 专业 Eval workers 复用统一执行链
- **触发**: Eval 自建 Agent Loop，无法使用真实 Agent Process 身份和统一生命周期。
- **改动**: CHIEF graph、backtrack、attribution 和 rule workers 改为 bundled Agent.md，并由
  AgentSupervisor 启动。
- **影响**: 证明专业 Application 无需专用 Runtime；角色差异可以由 Agent.md 和任务输入表达。

### 变更: 从专业 Application 扩展到通用 Skill 编排
- **触发**: 可移植 Skill 通常只声明逻辑角色，不会为每个角色附带 Agent.md；Main 也看不到
  Registry 的有效 Application catalog。
- **改动**: 新增 bundled `general.md`，并把实时 Application name/description 投影到
  `spawn_agent` 工具描述。Skill 先匹配专业 Agent，否则显式使用 `general`。
- **影响**: Harness 只负责发现、fresh Process、并行、权限和结果返回；角色、任务图、文件产物、
  Reviewer 独立性和归并仍由 Skill 负责。

## 修复记录

本次没有独立历史 bug-fix change。实施验证中补齐了 package verifier 对 `general.md` 的
required-resource 检查，避免源码和 manifest 已包含资源但发布校验未强制要求它。

真实 Skill 运行轨迹随后暴露两个执行缺口：Main 虽加载 Skill，但跳过编排 reference 并自行
完成全部产物；Vision 检查又把本地 `file://` 路径误填为 ImageRef hash，导致子进程没有收到
图片。Skill 增加了可观察的 SubAgent 启动门禁；Harness 则将 cwd 内图片 file attachment
安全转换为缓存 ImageRef，并在 spawn 前拒绝伪造、缺失、超限或路径逃逸的图片引用。

## 最终状态

dscode 现在提供内置 `general` 和 `vision` Agent.md。`general` 使用 `model: inherit` 和
`tools: ["*"]` 请求继承父进程运行环境，但最终能力仍经过父 allowlist、deny、权限、
attachment 和隔离策略求交；每次启动拥有新的 Runtime 和 transcript，不复制 Main system
prompt 或父消息。

AgentSupervisor 提供只读 Application summaries，`spawn_agent` 的模型可见描述动态读取当前
Registry 并列出有效名称与职责。项目切换并重新加载 Registry 后，已有 Tool 对象也会展示新
catalog。调用方仍必须显式指定 Application，不会因省略名称隐式选择 `general` 或 `fork`。

真实多角色 Skill 已被整理为黑盒验收场景：Researcher、Content Strategist、Visual Producer
和 Reviewer 是 Skill 逻辑角色；已有匹配 Agent.md 时按真实名称启动，否则使用多个独立
`general` Process。并行、fresh 上下文和结果返回使用现有框架机制，Skill 自己维护依赖图、
`.work/*` 产物、Main 归并与返工。`fork` 和动态 Agent.md 创建不属于本次交付。

模型还可以用 file attachment 将父 Agent cwd 内刚生成的 PNG、JPEG、GIF、WebP 或 BMP
传给 Vision 等子进程。`spawn_agent` 在进程创建前完成 realpath 边界、文件类型和 20MB 上限
校验并写入 ImageCache；`image_ref` 只允许引用已经存在的缓存文件。
