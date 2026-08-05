## Why

`docs/ARCHITECTURE.md` 将上下文窗口映射为“寄存器”，但实际 Context 层管理的是容量受限、可压缩、可恢复的 Agent 消息工作集，更接近 RAM。错误类比还会混淆 Context、Session snapshot 与跨 Session Memory 的职责边界。

## What Changes

- 将“上下文窗口”的 OS 映射修正为 `RAM / Agent 进程工作集`。
- 补充 ContextManager、Session / Runtime Snapshot、MemoryManager 的内存层级映射。
- 明确“Memory”在 dscode 中指跨 Session 持久化知识，不等同于上下文窗口。
- 记录该映射来自当前实现语义，避免后续继续沿用无依据的“寄存器”类比。

## Capabilities

### New Capabilities

- `architecture-documentation`: 定义架构文档中的 Agent as OS 类比必须与组件的容量、生命周期和持久化语义一致。

### Modified Capabilities

无。

## Impact

- 修改 `docs/ARCHITECTURE.md` 的设计哲学映射表及相邻说明。
- 不修改运行时代码、配置、API、存储格式或用户界面。
