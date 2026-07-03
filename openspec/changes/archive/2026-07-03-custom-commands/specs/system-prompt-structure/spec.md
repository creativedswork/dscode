## MODIFIED Requirements

### Requirement: Section order
系统提示词的一级标题 SHALL 按以下顺序排列：Identity → Soul → Tool Use → AGENTS.md → Skills → Commands。

#### Scenario: Verify section sequence
- **WHEN** 解析系统提示词文件的一级标题序列
- **THEN** 标题顺序为 `# Identity`、`# Soul`、`# Tool Use`、`# AGENTS.md`、`# Skills`、`# Commands`
- **AND** 不允许其他一级标题插入此序列

## ADDED Requirements

### Requirement: Commands section
`# Commands` 章节 SHALL 列出所有可用的自定义 commands（名称 + 描述），格式为 `- <name>: <description>`。子目录 command 使用冒号分隔的路径派生名（如 `opsx:apply`）。

#### Scenario: Commands section when commands exist
- **WHEN** 存在至少一个自定义 command
- **THEN** system prompt 中包含 `# Commands` 章节
- **AND** 每条 command 格式为 `- <name>: <description>`，其中 `<name>` 为路径派生名（子目录用 `:` 分隔，如 `opsx:apply`）

#### Scenario: Commands section when no commands exist
- **WHEN** 没有自定义 commands
- **THEN** `# Commands` 章节不出现
