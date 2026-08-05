## Why

当前 Agent as OS 表格只覆盖部分主干概念，并把 System Prompt 与 Harness 同时映射为 Kernel、把 `SKILL.md` 映射为文件描述符、把 Tool 与 Driver 混为一层。这些类比与当前实现不一致，会模糊 Application、Process、System Call、Driver 和 Resource 的边界。

## What Changes

- 将 Agent as OS 映射整理为执行、进程、内存、I/O、安全、IPC 与持久化六个层次。
- 明确 Harness 是 Kernel，Model 是计算引擎，Agent Runtime 是进程执行环境，System Prompt 是进程启动时的只读策略与指令段。
- 明确 AgentApplication / Agent.md 是应用定义与可执行映像，Main Agent / SubAgent 是运行中的进程实例。
- 拆分 Tool Call、Tool Schema、Tool Registry、Driver 与被操作资源：Tool Call 是 system call，Tool Schema 是 ABI，Driver 连接一组 Tool 到磁盘或外部服务。
- 将 Skill 定义为按需加载的用户态能力模块，将 `SKILL.md` 定义为模块清单与指令源，不再类比文件描述符。
- 补充 AgentSupervisor、AgentContext、PermissionManager、EventBus / Agent Message、Worktree、Session snapshot 与 CheckpointManager 的 OS 对应关系。
- 标注类比边界：AgentSupervisor 不具备抢占式调度能力；没有实现依据的 OS 概念不强行映射。

## Capabilities

### New Capabilities

- `agent-as-os-model`: 定义 dscode 架构文档中 Agent、Harness、Application、Process、Context、Tool、Driver、Skill、权限、IPC 与持久化组件的统一 OS 语义模型。

### Modified Capabilities

无。

## Impact

- 修改 `docs/ARCHITECTURE.md` 的“设计哲学”章节，将单一映射表重构为分层映射和边界说明。
- 与 `correct-context-window-os-mapping` 的 Context / Memory 修正保持一致；实施前应先归档该 change。
- 不修改运行时代码、类型、API、配置、存储格式或用户界面。
