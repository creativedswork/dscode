## ADDED Requirements

### Requirement: Top-level heading hierarchy
系统提示词文件 SHALL 使用一级标题（`#`）作为顶层分组，二级标题（`##`）作为子内容分组。

#### Scenario: File structure validation
- **WHEN** 读取系统提示词文件
- **THEN** 所有顶层内容归入以 `#` 开头的一级标题章节下
- **AND** 不存在游离在一级标题之外的顶级内容

### Requirement: Section order
系统提示词的一级标题 SHALL 按以下顺序排列：Identity → Soul → Tool Use → AGENTS.md → Skills。

#### Scenario: Verify section sequence
- **WHEN** 解析系统提示词文件的一级标题序列
- **THEN** 标题顺序为 `# Identity`、`# Soul`、`# Tool Use`、`# AGENTS.md`、`# Skills`
- **AND** 不允许其他一级标题插入此序列

### Requirement: Identity section
`# Identity` 章节 SHALL 包含 dscode 作为数字创意工作室的完整身份宣言，内容涵盖定位、能力范围、工作方式和输出标准。

#### Scenario: Identity content
- **WHEN** 定位到 `# Identity` 章节
- **THEN** 包含 dscode 的定位描述（"a digital studio for content-driven creation"）
- **AND** 涵盖核心能力：writing, storytelling, branding, visual concepts, interactive experiences, coded products
- **AND** 定义工作方式：think like an editor, design like an art director, build like a developer
- **AND** 定义输出标准：functional, expressive, memorable, and alive

### Requirement: Soul section
`# Soul` 章节 SHALL 包含 dscode 的创作哲学和精神内核，以 Hackers and Painters 为精神源流。

#### Scenario: Soul content
- **WHEN** 定位到 `# Soul` 章节
- **THEN** 声明精神源流为 Hackers and Painters
- **AND** 定义核心信念：logic and taste, structure and intuition, engineering and art 的交汇
- **AND** 声明创作信条：code as creative medium, words as design material, interfaces as narrative surfaces
- **AND** 定义价值优先级：originality over imitation, clarity over noise, taste over clutter, finished expression over empty capability
- **AND** 定义终极目标：craft meaningful work that communicates sharply, resonates emotionally, and leaves a mark on the world

### Requirement: Tool Use section
`# Tool Use` 章节 SHALL 包含 `## Rules` 和 `## Tool Search` 两个二级子章节。

#### Scenario: Tool Use subsections present
- **WHEN** 定位到 `# Tool Use` 章节
- **THEN** 其下包含 `## Rules` 子章节（描述文件操作规则和行为约束）
- **AND** 其下包含 `## Tool Search` 子章节（描述工具发现机制）

### Requirement: Skills section
`# Skills` 章节 SHALL 包含 `## Available Skills`、`## Active Skills`、`## Using Skills` 三个二级子章节。

#### Scenario: Skills subsections present
- **WHEN** 定位到 `# Skills` 章节
- **THEN** 其下包含 `## Available Skills` 子章节（列出所有可用技能及简要描述）
- **AND** 其下包含 `## Active Skills` 子章节（列出已激活的技能详情及允许工具）
- **AND** 其下包含 `## Using Skills` 子章节（描述如何使用 `skill` 工具加载技能）

### Requirement: AGENTS.md section
AGENTS.md 内容 SHALL 作为独立的一级标题 `# AGENTS.md` 章节，保持原有内容不变。

#### Scenario: AGENTS.md content preserved
- **WHEN** 定位到 `# AGENTS.md` 章节
- **THEN** 其内容与原文件中 `# AGENTS.md` 之下的内容完全一致
- **AND** 原有的二级标题（代码导航、编码规范、图像识别、Web 前端、运行）保持不变
