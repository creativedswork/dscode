## ADDED Requirements

### Requirement: Capability 单调收窄

子 Agent 的最终 capability SHALL 由父级 hard deny、项目路径边界、Application tools/disallowedTools、permissionMode、attachment、isolation 和 depth 共同派生。任何子级配置 MUST NOT 覆盖父级 hard deny。

#### Scenario: 父级 deny 保留
- **WHEN** 父进程禁止 bash 且子 Application 声明 tools 包含 Bash
- **THEN** 子 Agent 最终 capability 不包含 bash

### Requirement: Application 工具白名单与黑名单

`tools` SHALL 表示候选白名单，`["*"]` SHALL 表示全部候选工具；`disallowedTools` SHALL 在白名单之后继续排除工具。

#### Scenario: 通配符与黑名单
- **WHEN** Application 声明 `tools: ["*"]` 且 disallowedTools 包含 write_file
- **THEN** 最终 capability 包含其他允许工具但不包含 write_file

### Requirement: Claude Code 工具表达式编译

兼容层 SHALL 将 Claude Code 工具名和常用工具限制表达式编译为 dscode capability rule。无法无歧义编译的表达式 MUST 产生诊断。

#### Scenario: Agent 工具别名
- **WHEN** Claude 配置包含 `Agent`
- **THEN** 编译器将其映射为 spawn_agent，并继续应用 depth 和父级权限限制

### Requirement: MCP 工具遵循统一权限

MCP 工具 SHALL 与内置工具使用相同的白名单、黑名单、父级 deny 和 attachment 规则。MCP 工具 MUST NOT 因名称前缀而绕过权限。

#### Scenario: 后台 MCP 写操作
- **WHEN** 后台 Application 未声明某个 MCP 写工具
- **THEN** 该工具不可见，即使 MCP Server 已连接

### Requirement: 后台非交互权限

background Agent MUST NOT 打开用户权限对话框。权限决策为 ask 时 SHALL 转为 deny，并在工具结果中说明后台进程不能交互。

#### Scenario: 后台 ask
- **WHEN** 后台 Agent 调用需要 ask 的 bash 命令
- **THEN** 调用被拒绝且 Main Agent 不出现隐藏或延迟的权限弹窗

### Requirement: Claude permissionMode 映射

系统 SHALL 至少支持：

- `default`：继承父级约束；
- `acceptEdits`：允许工作区范围内已授权编辑；
- `plan`：只读；
- `bypassPermissions`：仅 managed policy。

#### Scenario: Plan 模式
- **WHEN** Application permissionMode 为 plan
- **THEN** 最终 capability 不包含写文件、编辑和产生副作用的 Shell 调用

### Requirement: 递归和深度限制

系统 SHALL 提供全局最大 Agent 深度，默认值 SHALL 为 1。`spawn_agent` 只有在当前 depth 小于最大值且 Application 明确允许时才可见。

#### Scenario: 深度达到上限
- **WHEN** depth 等于最大值
- **THEN** 当前 Agent 无法启动更多子进程

### Requirement: Session Grant 不继承

父进程通过交互获得的 session grant MUST NOT 自动复制到子进程。子进程 SHALL 从持久规则和 Application capability 重新计算权限。

#### Scenario: 父级临时授权
- **WHEN** 用户只为 Main Agent 当前 Session 临时允许 bash
- **THEN** 新 SubAgent 不自动获得 bash grant

### Requirement: 写进程隔离

background Agent 最终 capability 包含写工具时，系统 SHALL 要求 isolation 为 worktree；否则进程启动失败。

#### Scenario: 后台写主工作区
- **WHEN** background Application 可写且 isolation 为 none
- **THEN** Supervisor 拒绝启动并返回需要 worktree 的诊断
