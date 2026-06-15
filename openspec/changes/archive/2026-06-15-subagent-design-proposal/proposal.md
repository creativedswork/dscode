## Why

当前 AI 编程助手在单 Agent 模式下存在上下文窗口膨胀、任务耦合度高、并行处理能力弱等瓶颈。参考 Claude Code 的 SubAgent 实现，引入子代理（SubAgent）架构，使主 Agent 能将复杂任务委派给专业化子代理执行，实现任务隔离、并行处理和上下文优化，显著提升复杂编程任务的处理效率和质量。

## What Changes

- **新增 AgentTool 工具**：作为主 Agent 调用子代理的统一入口，支持同步/异步/后台三种执行模式
- **新增子代理定义与加载系统**：支持内置代理（Explore/Plan/general-purpose）、用户自定义代理（Markdown/JSON 配置）、插件代理三种来源
- **新增子代理运行引擎（runAgent）**：实现子代理的完整生命周期管理，包括系统提示构建、MCP 服务器初始化、上下文隔离、侧链转录记录
- **新增 Fork Subagent 机制**：通过继承父 Agent 的完整对话上下文和系统提示，实现 Prompt Cache 共享和低成本并行分叉
- **新增 Agent Context（AsyncLocalStorage）**：基于 Node.js AsyncLocalStorage 实现并发安全的代理身份追踪和分析归因
- **新增代理工具过滤系统**：支持通配符、白名单、黑名单、异步工具限制等多维度的工具权限控制
- **新增 Agent Memory 持久化记忆**：支持 user/project/local 三级作用域的代理持久记忆，自动加载到系统提示
- **新增代理进度追踪与通知**：后台代理完成后通过 `<task-notification>` 机制通知父代理
- **新增代理中断与恢复（Resume）**：支持通过 SendMessage 恢复后台代理、基于侧链转录重建代理状态
- **新增 Worktree/Remote 隔离模式**：支持 Git Worktree 文件系统隔离和远程执行环境隔离

## Capabilities

### New Capabilities

- `agent-tool`: AgentTool 工具定义与调用入口，包括输入/输出 Schema、权限校验、代理类型筛选
- `agent-definition`: 代理定义系统，包括内置代理、用户自定义代理、插件代理的定义规范、加载机制和校验
- `agent-execution-engine`: 子代理运行引擎，包括同步/异步执行、生命周期管理、系统提示构建、上下文隔离
- `fork-subagent`: Fork 子代理机制，包括 Prompt Cache 共享策略、分叉消息构建、递归分叉防护
- `agent-context`: Agent Context 上下文追踪系统，基于 AsyncLocalStorage 实现并发安全的身份传播
- `agent-tool-filtering`: 代理工具过滤与权限控制，通配符/白名单/黑名单/异步限制等多维度策略
- `agent-memory`: Agent Memory 持久化记忆系统，user/project/local 三级作用域
- `agent-progress-notification`: 代理进度追踪与后台通知机制
- `agent-resume`: 代理中断恢复机制，侧链转录重建与状态恢复
- `agent-isolation`: Worktree 和 Remote 隔离执行环境

### Modified Capabilities

<!-- 现有能力无需求变更 -->

## Impact

- **工具系统**：新增 AgentTool 作为核心工具，需在工具池组装、权限校验、Prompt 生成中集成
- **查询引擎（QueryEngine）**：需支持子代理的查询循环、中断处理和侧链转录记录
- **消息系统**：新增 ProgressMessage、ToolUseSummaryMessage、TombstoneMessage 等消息类型
- **状态管理（AppState）**：新增任务注册表、代理名称注册表、代理进度状态
- **MCP 集成**：子代理可定义独立 MCP 服务器，支持父代理 MCP 客户端的继承与合并
- **权限系统**：子代理继承/独立权限模式，YOLO 分类器集成
- **前端 UI**：需新增 AgentProgressLine、CoordinatorAgentStatus、TaskListV2 等组件
