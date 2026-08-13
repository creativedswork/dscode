## ADDED Requirements

### Requirement: Registry 暴露 Application catalog

AgentApplicationRegistry SHALL 提供当前 generation 中全部有效 Application 的只读 catalog，
每个条目 MUST 至少包含最终 `name` 和 `description`，并 SHALL 按 name 稳定排序。无效配置
MUST 保持在 diagnostics 中，不得伪装为可启动 Application。

#### Scenario: 发现项目专业 Agent
- **WHEN** 项目存在合法的 `.dscode/agents/reviewer.md` 且 Registry 完成加载
- **THEN** catalog 包含 `reviewer` 的最终 name 和 description

#### Scenario: 项目切换后刷新 catalog
- **WHEN** Harness 切换项目路径并重新加载 Registry
- **THEN** 后续读取 catalog 返回新项目的有效 Application，不继续返回旧项目专属条目

## MODIFIED Requirements

### Requirement: Bundled Application 必须文件化

系统 SHALL 通过 `resources/agents/vision.md` 提供 Vision Bundled Application，并 SHALL 通过
`resources/agents/general.md` 提供通用 Bundled Application。`bundled` SHALL 只表示随 dscode
发行的来源，Bundled Agent.md MUST NOT 放在 `src/`。

系统 MUST NOT 在 TypeScript 中硬编码 Vision 或 general Application 的 systemPrompt。Main、
explore、plan 和 reviewer 不属于本变更的 Bundled Agent.md 范围。

#### Scenario: Vision 使用声明式配置
- **WHEN** Main Agent 启动 `vision`
- **THEN** 该 Agent 使用 `vision.md` 的 Prompt、model、空 capability 和 fallback，并由通用 PiAgentRuntimeAdapter 执行

#### Scenario: general 使用声明式配置
- **WHEN** Main Agent 启动 `general`
- **THEN** 该 Agent 使用 `general.md` 的 Prompt 和继承配置，并由通用 PiAgentRuntimeAdapter 执行

#### Scenario: 模型升级更新 Bundled Application
- **WHEN** 发行版本修改 `resources/agents/vision.md` 或 `resources/agents/general.md` 的 Prompt
- **THEN** 不修改 AgentSupervisor 或 PiAgentRuntimeAdapter 即可改变对应新 Process 的行为
