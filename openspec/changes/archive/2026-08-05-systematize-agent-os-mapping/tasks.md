## 1. 前置一致性

- [x] 1.1 确认 `correct-context-window-os-mapping` 已归档，并以其 Context / Memory 映射作为本变更基线
- [x] 1.2 对照 Harness、AgentSupervisor、AgentContext、SkillManager、ToolRegistry、DriverRegistry、PermissionManager、SessionManager 与 CheckpointManager 的当前实现复核术语

## 2. 重构 Agent as OS 模型

- [x] 2.1 将 `docs/ARCHITECTURE.md` 的单一映射表重构为 Kernel 与计算、应用与进程、内存与状态、I/O、能力与隔离、通信与恢复六层映射
- [x] 2.2 修正重复和错误类比：System Prompt 不再映射为 Kernel，Skill / `SKILL.md` 不再映射为 Driver 或文件描述符
- [x] 2.3 明确 AgentApplication / Agent.md 与 Agent Process、AgentSupervisor、AgentContext、PID / PPID 的关系

## 3. 明确 I/O 与能力边界

- [x] 3.1 增加 `Agent → Tool Call → Tool Schema / Registry → Driver → Resource` 调用链，并分别给出文件系统与 MCP 示例
- [x] 3.2 补充 PermissionManager、Worktree、Agent Message、HarnessEventBus、Session、Runtime Snapshot、MemoryManager 与 CheckpointManager 的映射
- [x] 3.3 记录类比边界，明确当前没有抢占式 Scheduler、通用文件描述符表或 dscode 管理的 CPU 寄存器

## 4. 验证

- [x] 4.1 检查新映射与 `docs/ARCHITECTURE.md` 后续 Layer 1–5、Agent 进程模型及 Harness 组装章节一致
- [x] 4.2 运行 OpenSpec strict validation、Markdown 格式检查和差异检查
