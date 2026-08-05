## Context

`docs/ARCHITECTURE.md` 以 Agent as OS 作为设计哲学，但当前表格形成于统一 Agent Process 架构之前。现在代码已经具备 `AgentSupervisor`、`AgentContext`、独立 Runtime、Tool / Driver Registry、PermissionManager、EventBus、Worktree 隔离、Session 和 Runtime Snapshot，原表既未覆盖这些组件，也把不同层次的概念压缩成同一映射。

前置 change `correct-context-window-os-mapping` 已确认 Context Window 是 RAM / Agent 进程工作集，并区分 Context、Snapshot 与长期 Memory。本变更在该基础上整理完整模型。

## Goals / Non-Goals

**Goals:**

- 建立与当前代码结构一致的 Agent as OS 分层词汇表。
- 清晰区分定义与实例、调用与实现、运行状态与持久状态。
- 让 Tool、Driver 和实际资源形成可追踪的 I/O 调用链。
- 明确哪些映射只是近似，哪些 OS 能力尚未由 dscode 实现。

**Non-Goals:**

- 不要求 dscode 实现真实 OS 的全部能力。
- 不引入抢占式调度、虚拟内存、文件描述符表或新的 IPC 协议。
- 不修改现有类名、运行时行为或公开 API。
- 不把模型内部的 KV cache、hidden state 等实现细节纳入 Harness 契约。

## Decisions

### 1. 使用六层映射，而不是继续扩张单表

文档按以下层次组织：

1. **Kernel 与计算**：Harness、Model、Agent Runtime。
2. **应用与进程**：AgentApplication / Agent.md、Main Agent、SubAgent、AgentSupervisor、AgentContext。
3. **内存与状态**：Context Window、ContextManager、Session messages、Runtime Snapshot、MemoryManager。
4. **I/O**：Tool Call、Tool Schema、ToolRegistry、DriverRegistry / Driver、MCP Server、实际资源。
5. **能力与隔离**：Skill / SKILL.md、PermissionManager、Worktree。
6. **通信与恢复**：Agent Message、HarnessEventBus、Session、CheckpointManager。

分层可以表达一对多和组合关系，避免为了保持一行一个名词而牺牲准确性。

### 2. Harness 是 Kernel，System Prompt 不是 Kernel

Harness 负责组装组件、创建 Runtime、管理进程、权限、I/O 与生命周期，因此对应 Kernel。Model 提供推理计算，近似 CPU / execution engine；Agent Runtime 驱动单个 Agent 的执行循环。

System Prompt 是 Runtime 创建时装载的身份、规则和策略，归属于进程映像中的只读策略 / 指令段。它影响程序行为，但不负责管理其他进程或硬件，因此不再映射为 Kernel。

### 3. Application 是定义，Agent 是进程实例

- AgentApplication / Agent.md：应用定义、可执行映像与 manifest。
- Main Agent / SubAgent：由同构 Runtime 执行的进程实例。
- `agentId` / `parentAgentId`：PID / PPID。
- AgentContext：近似 PCB、cwd、凭据与 capability set。
- AgentSupervisor：进程表、生命周期与 foreground/background Job Control。

AgentSupervisor 没有时间片、优先级或抢占机制，因此明确不称为 Scheduler。

### 4. Tool 是调用面，Driver 是资源适配层

规范化 I/O 链：

```text
Agent Process
  → Tool Call (system call)
  → Tool Schema + ToolRegistry (ABI + syscall table)
  → Driver (device/resource adapter)
  → Disk / Shell / MCP Server / Remote Service
```

`read_file`、`write_file`、`bash` 和 MCP tools 是 Agent 可调用的原子 Tool，不是 Driver。`fs`、`shell`、builtin/MCP Driver 将一组 Tool 连接到真实资源。MCP Server 可能代表外部设备、应用或远程服务，不统一写死为 USB 设备。

### 5. Skill 是用户态能力模块，SKILL.md 是 manifest

Skill 激活后注入 instructions，并选择可用 Driver tools；它不直接实现底层 I/O，也不是内核驱动。Skill 对应按需加载的用户态能力模块 / library，`SKILL.md` 对应模块 manifest 与指令源。

文件描述符是进程运行时打开资源后产生的句柄。dscode 当前没有通用 FD 表，因此删除 `SKILL.md = 文件描述符` 类比，不寻找替代组件硬套。

### 6. 安全、IPC 和持久化单独表达

- PermissionManager：capability / ACL / syscall filter。
- Agent Message：进程间定向消息。
- HarnessEventBus：内核内事件分发，不宣称为跨进程传输总线。
- Worktree：文件系统隔离工作区，近似 filesystem namespace / sandbox。
- Session：用户交互通道近似 TTY；其 serialized messages 同时是可恢复会话快照。
- CheckpointManager：文件级 snapshot / rollback journal，不等同于进程 checkpoint。

## Risks / Trade-offs

- **[类比被误读为实现承诺]** → 每层增加“近似”和“不具备能力”说明。
- **[同一组件承担多种职责]** → 区分交互角色与持久化角色，例如 Session 的 TTY 与 snapshot 两面。
- **[术语比原表复杂]** → 保留一张摘要表，辅以 I/O 链和边界说明，不扩写成 OS 教程。
- **[与前置 change 发生编辑冲突]** → 先归档 `correct-context-window-os-mapping`，再实施本变更。

## Migration Plan

1. 归档 `correct-context-window-os-mapping`，使 Context / Memory 规范进入主 specs。
2. 重构 `docs/ARCHITECTURE.md` 的设计哲学章节，保留其余架构内容。
3. 对照相关实现类和 Layer 1–5 章节检查术语一致性。
4. 运行 OpenSpec strict validation 和 Markdown / diff 检查。

本变更仅修改文档，回滚时恢复该章节即可。

## Open Questions

无。未来若实现真正的 Scheduler、通用资源句柄或进程恢复，再通过独立 change 增加对应映射。
