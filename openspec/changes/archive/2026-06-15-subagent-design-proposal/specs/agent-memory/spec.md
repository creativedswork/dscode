## ADDED Requirements

### Requirement: 记忆作用域
系统 SHALL 支持三种代理记忆作用域：
- **user**：`~/.claude/agent-memory/<agentType>/MEMORY.md`，跨项目共享
- **project**：`.claude/agent-memory/<agentType>/MEMORY.md`，项目级，可版本控制
- **local**：`.claude/agent-memory-local/<agentType>/MEMORY.md`，项目级，不入版本控制

#### Scenario: 作用域路径解析
- **WHEN** 代理 `memory: "project"` 且 `agentType: "code-reviewer"`
- **THEN** 记忆文件路径为 `<cwd>/.claude/agent-memory/code-reviewer/MEMORY.md`

### Requirement: 记忆注入
系统 SHALL 在代理启动时将记忆内容注入系统提示。

注入格式 SHALL 包含：
- 记忆标题：`Persistent Agent Memory`
- 作用域提示：user 作用域提示跨项目适用，project 作用域提示项目专用
- 完整 MARKDOWN 文件内容

#### Scenario: 记忆作为系统提示
- **WHEN** code-reviewer 代理定义了 `memory: "project"` 且 `MEMORY.md` 包含 "always check for SQL injection"
- **THEN** 系统提示中包含该 SQL 注入检查提示

### Requirement: 记忆更新
系统 SHALL 允许子代理通过 `Write` 或 `Edit` 工具更新其记忆文件。

记忆文件路径 SHALL 在 `isAgentMemoryPath()` 中识别为代理记忆路径。

#### Scenario: 子代理更新记忆
- **WHEN** code-reviewer 代理在任务中发现新的代码规范问题，写入 `MEMORY.md`
- **THEN** 下次 code-reviewer 启动时自动加载更新后的记忆

### Requirement: 记忆目录创建
系统 SHALL 在代理启动时自动创建记忆目录（如不存在），创建操作 SHALL 为 fire-and-forget（不阻塞代理启动）。

#### Scenario: 首次使用
- **WHEN** 首次启动带有 `memory: "project"` 的代理且记忆目录不存在
- **THEN** 系统异步创建目录，代理正常启动

### Requirement: 记忆安全
`isAgentMemoryPath()` SHALL 通过路径规范化（normalize）防止路径穿越攻击。

#### Scenario: 路径穿越防护
- **WHEN** 检查 `../../etc/passwd` 是否在代理记忆目录中
- **THEN** 规范化后判断为非记忆路径
