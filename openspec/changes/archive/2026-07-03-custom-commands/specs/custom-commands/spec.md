## ADDED Requirements

### Requirement: Scan commands from .dscode/commands (including subdirectories)
系统 SHALL 从 `~/.dscode/commands/`（用户级）和 `<project>/.dscode/commands/`（项目级）递归扫描并加载自定义 commands。command name 由文件相对路径派生（`/` 替换为 `:`）。

#### Scenario: Scan user commands directory
- **WHEN** `~/.dscode/commands/` 目录存在且包含一个合法的 `code-review.md`
- **THEN** `code-review` command 被加载且其 source 为 `"user"`

#### Scenario: Scan project commands directory
- **WHEN** `<project>/.dscode/commands/` 目录存在且包含一个合法的 `deploy.md`
- **THEN** `deploy` command 被加载且其 source 为 `"project"`

#### Scenario: Scan subdirectory
- **WHEN** `<project>/.dscode/commands/opsx/` 子目录存在且包含 `apply.md`、`archive.md`
- **THEN** `opsx:apply` 和 `opsx:archive` 两个 commands 被加载

#### Scenario: Project overrides user
- **WHEN** 用户级和项目级都存在名为 `code-review` 的 command
- **THEN** 系统使用项目级的 `code-review` command

#### Scenario: Project overrides user in subdirectory
- **WHEN** 用户级和项目级都存在 `opsx/apply.md`
- **THEN** 系统使用项目级的 `opsx:apply` command

#### Scenario: Missing directory is fine
- **WHEN** `~/.dscode/commands/` 或 `<project>/.dscode/commands/` 目录不存在
- **THEN** 系统正常启动，不报错，无自定义 commands 可用

### Requirement: Command file format
Command 文件 SHALL 使用 YAML frontmatter + Markdown body 格式，`$input` 作为用户输入的占位符。`name` 字段可选（用于 sanity check），`description` 字段必需。command name 由文件路径派生。

#### Scenario: Valid command file with name field
- **WHEN** 文件 `<name>.md` 包含合法的 YAML frontmatter（`name` 与路径派生名一致，`description` 为非空字符串）以及 body 内容
- **THEN** 该文件被解析为有效的 command

#### Scenario: Valid command file without name field
- **WHEN** 文件的 frontmatter 中缺少 `name` 字段但 `description` 存在
- **THEN** command name 由文件路径派生（如 `opsx/apply.md` → `opsx:apply`），文件正常加载

#### Scenario: Name field mismatch with path
- **WHEN** `commands/opsx/apply.md` 的 frontmatter 中 `name` 字段为 `my-apply`（与路径派生名 `opsx:apply` 不一致）
- **THEN** 该文件被跳过，系统打印 warning

#### Scenario: Missing description field
- **WHEN** 文件的 frontmatter 中缺少 `description` 字段
- **THEN** 该文件被跳过，不注册为 command

#### Scenario: File without frontmatter
- **WHEN** 文件不以 `---` 开头
- **THEN** 该文件被跳过

#### Scenario: $input placeholder
- **WHEN** command body 中包含 `$input` 字符串且用户输入为 "src/foo.ts"
- **THEN** 发送给 LLM 的消息中 `$input` 被替换为 "src/foo.ts"

#### Scenario: Body without $input
- **WHEN** command body 中不包含 `$input`
- **THEN** body 直接作为 user message 发送，用户输入被忽略

### Requirement: Slash command integration
自定义 commands SHALL 出现在 slash command 自动补全列表中，通过 `/` 触发。

#### Scenario: Slash autocomplete includes custom commands
- **WHEN** 用户在输入框中输入 `/`
- **THEN** 自动补全列表中包含所有自定义 commands（名称 + 描述），排在内置 commands 之前

#### Scenario: Subdirectory command in slash autocomplete
- **WHEN** 用户在输入框中输入 `/` 且存在 command `opsx:apply`
- **THEN** 自动补全列表中显示 `opsx:apply` 及其描述

#### Scenario: Selecting a custom command
- **WHEN** 用户从自动补全列表中选择 `/code-review`
- **THEN** 输入框中显示 `/code-review `，用户可继续输入内容

#### Scenario: Selecting a subdirectory command
- **WHEN** 用户从自动补全列表中选择 `/opsx:apply`
- **THEN** 输入框中显示 `/opsx:apply `，用户可继续输入内容

#### Scenario: Sending a custom command
- **WHEN** 用户输入 `/code-review src/foo.ts` 并回车
- **THEN** command body 中的 `$input` 被替换为 `src/foo.ts`，作为完整的 user message 发送给 LLM

#### Scenario: Sending a subdirectory command
- **WHEN** 用户输入 `/opsx:apply my-change` 并回车
- **THEN** `opsx/apply.md` 的 body 中 `$input` 被替换为 `my-change`，作为完整的 user message 发送

#### Scenario: Built-in command takes precedence when name conflicts
- **WHEN** 存在一个自定义 command 名为 `help`（和内置 command 同名）
- **THEN** 内置 `/help` 优先执行，自定义 `help` command 不出现在列表中
