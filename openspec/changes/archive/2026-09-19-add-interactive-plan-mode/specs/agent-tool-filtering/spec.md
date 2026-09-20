## MODIFIED Requirements

### Requirement: Claude permissionMode 映射

系统 SHALL 至少支持：

- `default`：继承父级约束；
- `acceptEdits`：允许工作区范围内已授权编辑；
- `plan`：仅允许 effect metadata 明确为 `read` 的工具和无副作用的 Plan domain operations；
- `bypassPermissions`：仅 managed policy。

每个内置、MCP 和后续动态工具 MUST 声明 `effect` 为 `read | workspace_write | process | network | external_write | unknown`。在 `plan` 模式中，缺失 effect metadata 或声明为 `unknown` 的工具 MUST 默认拒绝；工具名黑名单不能作为唯一安全边界。

#### Scenario: Plan 模式
- **WHEN** Application permissionMode 为 plan
- **THEN** 最终 capability 只包含 effect 为 read 的工具和无副作用的 Plan domain operations

#### Scenario: 未知工具副作用
- **WHEN** plan 模式 Application 发现未声明 effect metadata 的内置、MCP 或动态工具
- **THEN** 该工具以 unknown 处理并从最终 capability 中移除

#### Scenario: MCP 只读工具
- **WHEN** MCP 工具声明 effect 为 read 且通过父级、Application、attachment 和 isolation 约束
- **THEN** plan 模式可以使用该工具进行调查

#### Scenario: 名称伪装为只读
- **WHEN** 工具名称看似只读但 effect 声明为 network 或 external_write
- **THEN** plan 模式拒绝该工具
