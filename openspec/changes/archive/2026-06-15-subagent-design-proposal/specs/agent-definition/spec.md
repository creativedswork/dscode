## ADDED Requirements

### Requirement: 代理定义结构
系统 SHALL 支持通过 `AgentDefinition` 接口定义子代理，每个代理定义 MUST 包含：
- `agentType`：唯一类型名（如 "Explore"、"code-reviewer"）
- `whenToUse`：描述什么场景下使用该代理
- `getSystemPrompt()`：返回代理的系统提示字符串
- `source`：来源标识（"built-in"、"userSettings"、"projectSettings"、"policySettings"、"plugin"）

代理定义可选字段 SHALL 包括：
- `tools`：工具白名单，`["*"]` 表示全部可用
- `disallowedTools`：工具黑名单
- `model`：模型别名或 "inherit"
- `permissionMode`：权限模式
- `maxTurns`：最大对话轮次
- `skills`：预加载的技能列表
- `mcpServers`：代理专属 MCP 服务器
- `hooks`：会话级钩子
- `color`：显示颜色
- `memory`：记忆作用域（"user"/"project"/"local"）
- `background`：是否始终后台运行
- `isolation`：隔离模式
- `initialPrompt`：首个用户轮次前插入的提示

#### Scenario: 最小代理定义
- **WHEN** 定义一个仅包含必填字段的代理
- **THEN** 代理使用全部可用工具、继承父代理模型和权限模式

#### Scenario: 完整代理定义
- **WHEN** 定义一个包含所有可选字段的代理
- **THEN** 每个字段的值在运行时生效

### Requirement: 内置代理
系统 SHALL 提供以下内置代理：

1. **general-purpose**：通用研究代理，用于搜索代码和理解代码库
2. **Explore**：只读文件搜索专家，用于快速查找文件、搜索关键词
3. **Plan**：规划代理，用于生成结构化执行计划

#### Scenario: Explore 代理只读限制
- **WHEN** Explore 代理被调用
- **THEN** 其工具列表不包含 FileWrite、FileEdit、NotebookEdit 等写工具

#### Scenario: general-purpose 代理全能
- **WHEN** general-purpose 代理被调用
- **THEN** 其工具白名单为 `["*"]`，可使用所有非禁用工具

### Requirement: 自定义代理加载
系统 SHALL 从以下目录加载用户自定义代理（Markdown/JSON 格式）：
- 项目级：`.claude/agents/*.md`
- 用户级：`~/.claude/agents/*.md`
- 策略级：由管理员配置

代理文件 MUST 包含 YAML frontmatter 定义 `description`、`tools`、`model` 等元数据，正文为系统提示。

#### Scenario: 加载项目代理
- **WHEN** `.claude/agents/code-reviewer.md` 存在且格式正确
- **THEN** "code-reviewer" 代理出现在可用代理列表中

#### Scenario: 加载失败容错
- **WHEN** 某个代理文件解析失败
- **THEN** 该代理被跳过，记录错误日志，不影响其他代理加载

### Requirement: 插件代理
系统 SHALL 支持插件动态注册代理定义，插件代理的 `source` 为 "plugin"，并携带插件标识。

#### Scenario: 插件注册代理
- **WHEN** 插件通过 `registerAgent()` API 注册代理定义
- **THEN** 该代理与内置/自定义代理一起出现在可用列表中

### Requirement: 代理校验
系统 SHALL 使用 Zod Schema 校验代理定义的有效性，不符合 Schema 的代理 MUST 被拒绝加载。

#### Scenario: 缺少必填字段
- **WHEN** 代理文件缺少 `description` 字段
- **THEN** 该代理加载失败并报告错误
