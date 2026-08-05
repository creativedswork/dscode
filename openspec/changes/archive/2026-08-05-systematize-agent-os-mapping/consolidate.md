## 变更综述

dscode 的 Agent as OS 模型从统一 Agent Process 架构起步，先确立 AgentApplication、PID/PPID、AgentSupervisor、Session/TTY 与同构 Runtime，再将 Context Window 修正为进程工作集。本变更进一步把零散类比整理为 Kernel 与计算、应用与进程、内存与状态、I/O、能力与隔离、通信与恢复六层模型，并删除 System Prompt、Skill、Tool 与 Driver 之间不符合实现的映射。

## 变更时间线

- 2026-08-04: `subagent-design-proposal` — 建立 Agent 是进程、Application 是可执行定义、Main Agent 是 PID 1、Session 是 TTY 的统一进程模型。
- 2026-08-05: `correct-context-window-os-mapping` — 将 Context Window 从寄存器修正为 RAM / Agent 进程工作集，并区分 Context、Snapshot 与长期 Memory。
- 2026-08-05: `systematize-agent-os-mapping` — 将 Agent as OS 整理为六层模型，补齐 Tool、Driver、权限、IPC、隔离和恢复边界。

## 初始设计

`subagent-design-proposal` 将原有单 Main Agent 运行时升级为操作系统风格的进程模型：AgentApplication 描述可启动应用，Main Agent 与 SubAgent 通过同一 `PiAgentRuntimeAdapter` 执行，AgentSupervisor 管理进程表和生命周期，`agentId` / `parentAgentId` 表示 PID / PPID，Session 保持用户终端语义，AgentContext 和 Worktree 提供 capability 与文件系统隔离。

## 变更记录

### 变更: Context 成为进程级工作集
- **触发**: 原架构文档把 Context Window 写成寄存器，无法解释 token 预算、压缩、恢复和每进程独立 ContextManager。
- **改动**: 将 Context Window 定义为 RAM / Agent 进程工作集，ContextManager 定义为内存管理器 / pager。
- **影响**: Session messages 与 Runtime Snapshot 作为 backing state，MemoryManager 保持跨 Session 长期知识存储。

### 变更: I/O 拆分为 Tool、Driver 与 Resource
- **触发**: 原表将“工具（Drivers）”合并，无法区分 Agent 可调用动作和连接真实资源的适配层。
- **改动**: 建立 `Agent → Tool Call → Tool Schema / ToolRegistry → Driver → Resource` 调用链。
- **影响**: `read_file`、`write_file`、`bash` 和 MCP Tool 被定义为 system-call 面；Driver 负责将一组 Tool 连接到文件系统、Shell、MCP Server 或远程服务。

### 变更: 能力、安全和通信独立成层
- **触发**: Skill、PermissionManager、Worktree、Agent Message、EventBus 和 Checkpoint 没有统一边界。
- **改动**: Skill 定义为用户态能力模块，PermissionManager 定义为 capability / ACL / syscall filter，Worktree 定义为 filesystem namespace / sandbox，消息和事件分别对应定向 IPC 与 Kernel 内事件分发。
- **影响**: 文档能够区分能力编排、资源访问、运行时通信、会话恢复和文件回滚。

## 修复记录

### 修复: System Prompt 与 Harness 重复映射为 Kernel
- **症状**: 原表同时把 System Prompt 和 Harness 视为 Kernel。
- **根因**: 将行为约束误当成资源与生命周期管理者。
- **修复**: Harness 保留 Kernel 映射；System Prompt 改为进程启动策略 / 只读指令段。

### 修复: SKILL.md 被映射为文件描述符
- **症状**: 原表将 Skill 写成用户态程序，并将 `SKILL.md` 写成文件描述符。
- **根因**: 混淆静态 manifest 与运行时打开资源产生的句柄。
- **修复**: Skill 改为按需加载的用户态能力模块，`SKILL.md` 改为模块 manifest 与指令源；当前不存在通用文件描述符表。

### 修复: 进程管理被过度类比为调度器
- **症状**: AgentSupervisor 容易被理解为完整 OS Scheduler。
- **根因**: spawn、wait、前后台和信号管理与抢占调度边界未说明。
- **修复**: 将其限定为进程表、生命周期与 Job Control，并明确当前没有时间片、优先级和抢占机制。

## 最终状态

### Why

当前 Agent as OS 表格只覆盖部分主干概念，并把 System Prompt 与 Harness 同时映射为 Kernel、把 `SKILL.md` 映射为文件描述符、把 Tool 与 Driver 混为一层。这些类比与当前实现不一致，会模糊 Application、Process、System Call、Driver 和 Resource 的边界。

### What Changes

- 将 Agent as OS 映射整理为执行、进程、内存、I/O、安全、IPC 与持久化六个层次。
- 明确 Harness 是 Kernel，Model 是计算引擎，Agent Runtime 是进程执行环境，System Prompt 是进程启动时的只读策略与指令段。
- 明确 AgentApplication / Agent.md 是应用定义与可执行映像，Main Agent / SubAgent 是运行中的进程实例。
- 拆分 Tool Call、Tool Schema、Tool Registry、Driver 与被操作资源：Tool Call 是 system call，Tool Schema 是 ABI，Driver 连接一组 Tool 到磁盘或外部服务。
- 将 Skill 定义为按需加载的用户态能力模块，将 `SKILL.md` 定义为模块清单与指令源，不再类比文件描述符。
- 补充 AgentSupervisor、AgentContext、PermissionManager、EventBus / Agent Message、Worktree、Session snapshot 与 CheckpointManager 的 OS 对应关系。
- 标注类比边界：AgentSupervisor 不具备抢占式调度能力；没有实现依据的 OS 概念不强行映射。

### Capabilities

#### New Capabilities

- `agent-as-os-model`: 定义 dscode 架构文档中 Agent、Harness、Application、Process、Context、Tool、Driver、Skill、权限、IPC 与持久化组件的统一 OS 语义模型。

#### Modified Capabilities

无。

### Impact

- 修改 `docs/ARCHITECTURE.md` 的“设计哲学”章节，将单一映射表重构为分层映射和边界说明。
- 与已归档的 `correct-context-window-os-mapping` Context / Memory 修正保持一致。
- 不修改运行时代码、类型、API、配置、存储格式或用户界面。
