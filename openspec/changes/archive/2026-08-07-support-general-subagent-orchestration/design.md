## Context

AgentApplicationRegistry 已能加载 bundled、用户级和项目级 Agent.md，Supervisor 也能并行创建
独立 Process。但是 `spawn_agent` 只接受一个没有候选说明的字符串，Main Agent 无法可靠知道
Registry 中有哪些专业 Application；当 Skill 只描述动态角色而没有配套 Agent.md 时，也没有
统一的通用回退。

目标验收 Skill 使用 Researcher、Content Strategist、Visual Producer 和 Reviewer 等逻辑角色。
这些角色属于 Skill 编排，不应成为 dscode 类型或专用 Runtime。

## Goals / Non-Goals

**Goals:**

- 提供随发行包安装、可被项目配置覆盖的 `general` Agent.md。
- 让 Main Agent 在调用 `spawn_agent` 时看到 Registry 当前 Application 名称与描述。
- 保持专业 Agent、`general` 和现有 bundled worker 共用同一创建链。
- 证明多个 fresh SubAgent 可由 Skill 按依赖图串行或并行组合。

**Non-Goals:**

- 不实现 `fork` 或父 transcript 复制。
- 不动态创建或持久化 Researcher、Reviewer 等 Agent.md。
- 不在 Harness 中实现任务图、文件归并、Reviewer 策略或 Skill 业务状态机。
- 不新增 Application 语义类型、专业 Runtime 或 SubAgent 间通信协议。
- 不重构现有 `spawn_agent` input 信封。

## Decisions

### `general` 是 bundled Agent.md

`general` 使用与 `vision`、项目 Agent.md 相同的编译、覆盖、快照和 RuntimeFactory 链。其
frontmatter 使用 `model: inherit` 和 `tools: ["*"]`，最终 capability 仍与父 Process、deny
规则、权限模式和隔离策略求交。

`general` 使用自己的通用 SubAgent system prompt，并明确其 transcript 是 fresh。它不复制
Main system prompt 或消息历史；父 Agent 必须通过任务 prompt、文件路径或 selected context
提供完成任务所需的信息。这样可避免把 Main 专属编排指令和未闭合 Tool Call 注入独立 worker。

备选方案是为 `general` 增加 TypeScript subtype 或专用 Runtime。该方案会让用户态角色泄漏到
Harness，且与现有 Application 模型重复，因此不采用。

### Registry catalog 投影到 `spawn_agent`

AgentSupervisor 提供只读 Application summary 查询，`spawn_agent` 的工具描述通过 getter
读取当前 Registry，按名称稳定排序并展示名称与 description。这样模型在决定 Application
时能看到专业 Agent 和 `general`，而不需要另建配置协议或业务工具。

描述在访问时读取 Registry，而不是在 Harness 初始化时固化，确保项目切换触发 Registry
reload 后候选列表不会过期。

备选方案是新增 `list_applications` Tool。它会增加一次模型往返，并与每次 spawn 前都需要的
选择信息分离，因此本次不采用。

### 项目内图片使用标准 file attachment

真实 Skill 轨迹显示，模型为了让 Vision 检查刚生成的 PNG，将 `file://` 路径误填进
`image_ref.hash`。旧实现既没有拒绝伪造 hash，也没有把已经支持的 file attachment 转换成
Vision Runtime 可读取的图片，导致 Process 正常退出但模型实际没有收到图片。

模型调用面继续保留两种来源：已有 ImageCache 文件使用 `image_ref`；刚在项目中生成的图片
使用 `file` attachment。`spawn_agent` 在创建 Process 前解析 file path，对 cwd 的真实路径做
边界校验，限制为已支持图片扩展名和 20MB，然后通过 ImageCache 转换为标准 ImageRef。已有
image_ref 必须是单一缓存文件名且确实存在，路径、`file://` URI 和未知缓存引用直接失败。

备选方案是让 PiAgentRuntimeAdapter 直接读取任意 file attachment。该方案会把调用方授权与
路径边界下沉到 Runtime，并让持久化记录包含未规范化路径，因此不采用。

### Skill 负责角色解析和执行图

Skill 将 Researcher 等名称视为逻辑角色：先根据 Application catalog 的 description 选择匹配
Agent.md，没有匹配项时使用 `general`，并把角色、任务、输入、输出和证据写进本次委托 prompt。
同一轮多个独立 `spawn_agent` 调用由现有 Tool 并行机制处理。

Reviewer 独立性由 Skill 再次 spawn fresh Process 获得；`.work/*` 文件、Main 归并和返工均是
Skill 的产物协议，不进入 Framework。

### 真实 Skill 作为跨仓库验收夹具

`xiaohongshu-visual-post` 将明确写出上述最小 Runtime contract，并增加 eval cases 验证：

- 只有 `general` 时仍能完成多角色分工；
- 存在匹配 Agent.md 时优先选择它；
- 不要求动态生成 Agent.md、fork、同行通信或 Harness 业务状态。

dscode 的自动化测试只验证通用可观测契约，不依赖该外部仓库路径。

## Risks / Trade-offs

- [Tool 描述包含内部 bundled workers，候选较多] → 保留准确 description 和稳定排序，让 Skill
  仅按职责匹配；后续如确有需求再引入通用 visibility 字段。
- [`general` 拥有父进程允许的广泛工具] → capability 继续经过父 allowlist、Application 配置、
  deny、permission mode、attachment 和 worktree 规则求交，且递归 spawn 仍被禁止。
- [专业 Agent.md 在项目切换后变化] → 工具描述动态读取 Registry，不缓存 catalog 文本。
- [Skill 的“写入范围”不是强制文件 ACL] → Skill 使用明确路径与独立产物避免冲突；硬路径 ACL
  属于独立的隔离能力，不在本次伪装实现。
- [本地图片路径通过软链接逃逸 cwd] → 缓存前同时 realpath cwd 和目标文件，再执行包含关系校验。
