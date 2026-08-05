## ADDED Requirements

### Requirement: AgentApplication 表示可启动应用

系统 SHALL 使用 `AgentApplication` 表示 Agent 应用配置，而不是运行中的进程。每次启动 Application SHALL 创建独立 Agent 进程。

AgentApplication MUST 包含 `name`、`description`、`systemPrompt` 和 `source`，并 MAY 包含 `tools`、`disallowedTools`、`model`、`effort`、`permissionMode`、`mcpServers`、`hooks`、`maxTurns`、`skills`、`initialPrompt`、`memory`、`background`、`isolation`、`color`、`fallback`。

#### Scenario: 同一 Application 启动多个进程
- **WHEN** Main Agent 连续两次启动 `explore` Application
- **THEN** 系统创建两个拥有不同 agentId、共享同一 Application 配置的 Agent 进程

### Requirement: Markdown Application 配置

系统 SHALL 从 Markdown 文件加载 AgentApplication。YAML frontmatter SHALL 描述配置项，Markdown 正文 SHALL 作为 systemPrompt，文件名 SHALL 作为缺省 name。

#### Scenario: 加载最小配置
- **WHEN** `reviewer.md` 只包含 description frontmatter 和正文
- **THEN** 系统以 `reviewer` 为 name、正文为 systemPrompt，并对其他字段使用安全默认值

### Requirement: dscode 原生目录与来源优先级

系统 SHALL 加载以下原生目录：

- 用户级：`~/.dscode/agents/*.md`
- 项目级：`<project>/.dscode/agents/*.md`

同名 Application 的优先级 MUST 为：bundled < user compatibility < user dscode < project compatibility < project dscode < managed policy。

#### Scenario: 项目配置覆盖兼容配置
- **WHEN** `.claude/agents/reviewer.md` 与 `.dscode/agents/reviewer.md` 同时存在
- **THEN** 系统使用 `.dscode/agents/reviewer.md`

### Requirement: Claude Code 配置文件兼容

系统 SHALL 兼容以下 Claude Code 目录：

- `~/.claude/agents/*.md`
- `<project>/.claude/agents/*.md`

系统 SHALL 解析 Claude Code 常用 frontmatter 字段，并 SHALL 将兼容配置编译为 AgentApplication。

#### Scenario: 直接加载 Claude Code Agent
- **WHEN** 项目存在合法的 `.claude/agents/code-reviewer.md`
- **THEN** `code-reviewer` 出现在可用 Application 列表中且正文作为 systemPrompt

### Requirement: Claude Code 工具名适配

兼容编译器 SHALL 至少映射 `Read`、`Write`、`Edit`、`Glob`、`Grep`、`Bash`、`Agent` 和 `Task` 到对应 dscode 工具名。

#### Scenario: 只读工具映射
- **WHEN** Claude 配置声明 `tools: [Read, Grep, Glob]`
- **THEN** 编译后的 capability 为 `read_file`、`grep`、`glob`

### Requirement: Claude Code 模型别名适配

系统 SHALL 支持 `inherit`，并 SHALL 通过可配置 alias resolver 解析 `haiku`、`sonnet`、`opus`。系统 MUST NOT 将这些别名硬编码到单一 provider。

#### Scenario: 解析 sonnet
- **WHEN** Application 声明 `model: sonnet`
- **THEN** 系统使用 settings 中 balanced alias 对应的 provider/model

### Requirement: Claude Code 权限模式适配

系统 SHALL 将 `default`、`acceptEdits`、`plan` 和 `bypassPermissions` 编译为 dscode 权限策略。`bypassPermissions` MUST 仅能由 managed policy 启用。

#### Scenario: 项目配置请求 bypass
- **WHEN** 项目级 Claude 配置声明 `permissionMode: bypassPermissions`
- **THEN** Application 加载失败或被标记不可运行，并返回明确安全诊断

### Requirement: 配置诊断

解析器 SHALL 对未知字段、未知工具、无法解析的模型和未实现能力产生结构化诊断。系统 MUST NOT 静默放宽权限或忽略影响运行语义的字段。

#### Scenario: 未支持字段
- **WHEN** Application 使用当前未实现的运行字段
- **THEN** Application 列表显示 unsupported 诊断，启动时返回同一诊断

### Requirement: Bundled Application 必须文件化

系统 SHALL 通过 `resources/agents/vision.md` 提供 Vision Bundled Application。`bundled` SHALL 只表示随 dscode 发行的来源，Bundled Agent.md MUST NOT 放在 `src/`。

系统 MUST NOT 在 TypeScript 中硬编码 Vision Application 的 systemPrompt。Main、general、explore、plan 和 reviewer 不属于本变更的 Bundled Agent.md 范围。

#### Scenario: Vision 使用声明式配置
- **WHEN** Main Agent 启动 `vision`
- **THEN** 该 Agent 使用 `vision.md` 的 Prompt、model、空 capability 和 fallback，并由通用 PiAgentRuntimeAdapter 执行

#### Scenario: 模型升级更新 Vision
- **WHEN** 发行版本修改 `resources/agents/vision.md` 的 Prompt
- **THEN** 不修改 AgentSupervisor 或 PiAgentRuntimeAdapter 即可改变新 Vision Agent 的行为

### Requirement: Bundled 与外部配置共用编译链

Bundled Agent.md、`.dscode/agents/*.md` 和 `.claude/agents/*.md` SHALL 使用同一 frontmatter parser、TypeBox schema、tool alias adapter、model resolver、permission compiler 和 diagnostics。

#### Scenario: Bundled 配置非法
- **WHEN** `vision.md` 声明非法字段
- **THEN** 系统产生与外部 Agent.md 相同格式的编译诊断，不使用 Bundled 专用绕过

### Requirement: Bundled Agent.md 构建与发布

构建流程 SHALL 校验 `resources/agents/vision.md`，并 SHALL 将其复制到 `release/package/dist/resources/agents/`，同时生成包含版本、相对路径和 SHA-256 的 manifest。`vision.md` 缺失、无效或 digest 不匹配 MUST 使构建和运行时启动失败。

#### Scenario: 发布包包含配置
- **WHEN** 执行生产构建
- **THEN** release staging 包含 `dist/resources/agents/vision.md` 和引用该文件的 manifest

### Requirement: Application digest 与 Registry generation

Registry SHALL 对每个规范化后的 Application 配置和正文计算 digest，并 SHALL 为每次原子加载分配递增 generation。

#### Scenario: Prompt 变化
- **WHEN** `vision.md` 正文发生变化并重新加载
- **THEN** 新编译结果拥有新 digest 和新 Registry generation

### Requirement: Application 热更新快照

Agent 启动时 SHALL 获得不可变 Application snapshot。Agent.md 热更新 SHALL 只影响后续启动的 Agent；已经运行的 Agent MUST 保持启动时的配置。

#### Scenario: 运行中更新 Vision
- **WHEN** Vision Agent 正在运行且 `vision.md` 被重新加载
- **THEN** 当前进程继续使用旧 digest，下一次启动使用新 digest

### Requirement: Application 使用统一 Agent Runtime

所有 AgentApplication SHALL 由 PiAgentRuntimeAdapter 执行。`runtime` 和 `entrypoint` 不属于 Agent.md 配置字段，任何来源声明这些字段都 MUST 产生未知或不支持字段诊断。

#### Scenario: 项目配置选择内部入口
- **WHEN** `<project>/.dscode/agents/custom.md` 声明 `runtime: pipeline` 和 `entrypoint: vision`
- **THEN** Application 编译失败，且不能选择任何内部代码入口

### Requirement: Application fallback 配置

AgentApplication MAY 声明 fallback handler 与触发事件。编译器 SHALL 只接受系统注册的 handler 和事件类型，且 MUST 将规范化 fallback 保存到不可变 snapshot。

#### Scenario: Vision 声明 OCR fallback
- **WHEN** vision.md 声明已注册的 ocr handler 和合法触发事件
- **THEN** 编译结果将规范化 fallback 保存到 Application snapshot

#### Scenario: 项目声明未注册 fallback
- **WHEN** 项目 vision.md 声明未注册 handler 或未知触发事件
- **THEN** 编译失败并产生结构化 fallback 诊断
