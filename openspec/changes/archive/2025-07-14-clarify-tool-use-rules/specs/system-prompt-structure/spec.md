## MODIFIED Requirements

### Requirement: Tool Use section
`# Tool Use` 章节 SHALL 包含 `## Rules` 和 `## Tool Search` 两个二级子章节。`## Rules` SHALL 包含以下强制性规则：

1. 收到创建/修改/删除文件的请求时，必须立即调用对应工具（write_file 等），不得仅描述计划
2. 行动先于解释：先执行再简要说明
3. 并行化：无相互依赖的 tool call 应在同一响应中批量发出；有依赖的调用跨响应串行
4. 文件工具偏好：对项目文件操作优先使用 read_file / write_file / edit / grep；bash 仅用于构建、测试、git、包管理等实际 shell 指令，禁止对项目文件使用 sed、cat、awk
5. Skill 激活：若任务属于 "Available Skills" 中某个 Skill 的领域，必须先调用 `skill` 工具加载其完整指令再继续
6. 以用户语言回复，简洁直接
7. 写代码时产出完整可运行实现，不得留占位符或 TODO

#### Scenario: Tool Use subsections present
- **WHEN** 定位到 `# Tool Use` 章节
- **THEN** 其下包含 `## Rules` 子章节（包含上述 7 条规则）
- **AND** 其下包含 `## Tool Search` 子章节（描述工具发现机制）

#### Scenario: Rules include parallel execution policy
- **WHEN** 读取 `## Rules` 子章节
- **THEN** 包含并行化规则：独立 tool call 在同一响应中批量发出
- **AND** 包含串行规则：有数据依赖的调用跨响应分开发出

#### Scenario: Rules include file tool preference
- **WHEN** 读取 `## Rules` 子章节
- **THEN** 明确优先使用文件原生工具（read_file, write_file, edit, grep）操作项目文件
- **AND** 明确禁止用 bash 执行 sed、cat、awk 操作项目文件
- **AND** 明确 bash 保留用途：tests, builds, git, package management

#### Scenario: Rules include skill activation gate
- **WHEN** 读取 `## Rules` 子章节
- **THEN** 包含规则：任务涉及 Skill 领域时，必须先调用 `skill` 工具加载指令再执行
