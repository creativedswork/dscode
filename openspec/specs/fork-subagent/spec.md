## ADDED Requirements

### Requirement: Fork 子代理触发
当 Fork 功能开启且 `subagent_type` 参数省略时，系统 SHALL 自动创建 Fork 子代理。

Fork 子代理 SHALL 使用 `FORK_AGENT` 定义（`agentType: "fork"`），该定义：
- 不在可用代理列表中展示（不可通过 `subagent_type` 选择）
- `tools: ["*"]` 使用父代理的精确工具池
- `model: "inherit"` 继承父代理模型
- `permissionMode: "bubble"` 权限提示冒泡到父终端

#### Scenario: Fork 触发
- **WHEN** 主 Agent 调用 `Agent({description: "audit", prompt: "审计发布准备状态"})` 且 Fork gate 开启
- **THEN** 创建 Fork 子代理，继承父代理的完整上下文

### Requirement: Prompt Cache 共享
Fork 子代理 SHALL 复用父代理的系统提示、工具定义和消息前缀，确保 API 请求前缀逐字节相同以实现 Prompt Cache 命中。

`CacheSafeParams` SHALL 封装以下缓存关键参数：
- `systemPrompt`：系统提示
- `userContext`：用户上下文
- `systemContext`：系统上下文
- `toolUseContext`：工具使用上下文
- `forkContextMessages`：父代理的对话消息

#### Scenario: 缓存前缀相同
- **WHEN** 同时启动 3 个 Fork 子代理
- **THEN** 每个子代理的 API 请求前缀（系统提示 + 工具定义 + 对话前缀）完全一致

### Requirement: Fork 消息构建
系统 SHALL 通过 `buildForkedMessages()` 构建 Fork 子代理的消息，算法为：
1. 克隆父代理的完整 assistant 消息（保留所有 tool_use 块）
2. 为每个 tool_use 构建使用统一占位符文本的 tool_result
3. 追加包含 Fork 指令的子代理指令文本块

最终消息结构 SHALL 为：`[...history, assistant(all_tool_uses), user(placeholder_results..., directive)]`

#### Scenario: 消息结构
- **WHEN** 父代理在最后一个 assistant 消息中调用了 3 个工具
- **THEN** Fork 消息包含 3 个占位符 tool_result 和 1 个指令文本块

### Requirement: Fork 子代理行为指令
Fork 子代理 SHALL 接收明确的行为指令，告知其是分叉工作进程而非主代理。

指令 MUST 包含：
- "你是一个分叉工作进程，不是主代理"
- 规则：不嵌套生成子代理、直接执行任务
- 规则：使用工具后汇报，不在工具调用间输出文本
- 规则：响应以 "Scope:" 开头
- 输出格式：Scope / Result / Key files / Files changed / Issues

#### Scenario: Fork 行为约束
- **WHEN** Fork 子代理启动
- **THEN** 其系统提示中包含 `FORK_BOILERPLATE_TAG` 包裹的行为指令

### Requirement: 递归 Fork 防护
系统 SHALL 阻止 Fork 子代理再次 Fork。检测机制为：
1. 检查 `toolUseContext.options.querySource` 是否为 Fork 代理
2. 扫描消息历史中是否包含 `FORK_BOILERPLATE_TAG`

#### Scenario: 递归 Fork 被拒绝
- **WHEN** Fork 子代理尝试调用 `Agent({...})` 省略 `subagent_type`
- **THEN** 系统抛出错误：Fork 不可在分叉工作进程中使用
