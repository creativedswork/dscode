## Context

架构文档的 Agent as OS 表格自 2026-05-30 起将上下文窗口标为“寄存器”，但没有设计或实现依据。当前 `ContextManager` 对消息工作集执行 token 预算、淘汰、滑动窗口和 overflow 恢复；Session 和 Runtime Snapshot 持久化或冻结这些消息；`MemoryManager` 则保存跨 Session 的长期知识。

## Goals / Non-Goals

**Goals:**

- 让 OS 类比与组件的容量、易失性和持久化行为一致。
- 清晰区分运行中上下文、可恢复快照和长期记忆。
- 保持现有 Agent as OS 叙事，并增加必要的边界说明。

**Non-Goals:**

- 不修改 ContextManager、SessionManager、MemoryManager 或 Agent Runtime。
- 不重新定义整张 Agent as OS 映射表。
- 不把模型内部实现细节（如 KV cache 或隐藏状态）纳入 dscode 运行时契约。

## Decisions

### 1. 上下文窗口映射为 RAM / Agent 进程工作集

上下文窗口保存当前推理可见的 System Prompt、消息、工具定义与结果，容量有限且需要压缩淘汰，符合 RAM 中进程工作集的核心性质。

备选方案“寄存器”被否决：寄存器数量极少、保存当前指令的操作数和执行状态，不承担可分页的大规模工作集，也无法解释 dscode 的 token 预算与压缩策略。

### 2. 用分层说明避免“Memory”术语冲突

- `ContextManager` 对应内存管理器 / pager。
- Session 与 Runtime Snapshot 对应可恢复快照 / backing store。
- `MemoryManager` 对应持久化长期知识存储，内容被选择后再注入上下文。

这里的 RAM 是 OS 类比中的工作内存；`MemoryManager` 是产品组件名，两者不能因中文都称“内存/记忆”而合并。

### 3. 不为“寄存器”强行指定 dscode 组件

模型内部即时隐藏状态可近似理解为寄存器，但它不由 dscode 管理，也不是 Harness API。文档只删除错误映射，不新增无法由代码验证的组件映射。

## Risks / Trade-offs

- **[RAM 与物理 GPU 显存被误认为完全等价]** → 明确这是 OS 语义类比，使用“Agent 进程工作集”限定范围。
- **[Session 同时保存消息导致被误认为 RAM]** → 区分运行中工作集与持久化 backing store。
- **[MemoryManager 名称造成概念重叠]** → 在表格后增加一段生命周期说明。
