## 变更综述

dscode 的 Context 从早期“消息压缩模块”逐步演进为可观测、可恢复且按 Agent Process 隔离的 token 工作集，但 `docs/ARCHITECTURE.md` 的 Agent as OS 表格仍沿用无实现依据的“上下文窗口 = 寄存器”。本变更将文档修正为“RAM / Agent 进程工作集”，并明确 ContextManager、Session / Runtime Snapshot 与 MemoryManager 分别承担工作集管理、可恢复快照和长期知识存储。

## 变更时间线

- 2026-06-20: `context-window-usage-bar` — 将上下文窗口实现为按消息和工具类别统计的实时 token 工作集。
- 2026-06-20: `fix-context-window-refresh-on-session-switch` — Session 恢复后立即重算上下文，确认工作集由加载后的消息重建。
- 2026-08-04: `subagent-design-proposal` — 统一 Agent Process Runtime，并为各进程装配独立 ContextManager。
- 2026-08-05: `correct-context-window-os-mapping` — 修正架构类比并补齐 Context、Snapshot、Memory 的层级边界。

## 初始设计

ContextManager 最初负责估算消息 token、根据模型窗口计算预算，并通过淘汰或滑动窗口压缩消息。后续 WebUI 使用条将 System Prompt、用户消息、工具调用与空闲容量作为同一有限空间展示；这已经体现了 RAM 工作集的容量和淘汰性质。

## 变更记录

### 变更: Session 恢复重建当前工作集
- **触发**: Session 切换后 Context Window 使用条仍显示旧 Session 数据。
- **改动**: 在目标 Session 完成加载后，基于恢复的消息立即重算并广播上下文占用。
- **影响**: 明确 Session 是可恢复的持久化来源，当前 Context 是从消息快照装载出的运行时工作集。

### 变更: ContextManager 按 Agent Process 隔离
- **触发**: Main Agent 与 SubAgent 统一到同构 Agent Process Runtime。
- **改动**: 每个 Runtime 从 Application snapshot 装配自己的 ContextManager。
- **影响**: 上下文窗口成为进程级资源，“Agent 进程工作集”的类比比全局寄存器更准确。

## 修复记录

### 修复: 上下文窗口被错误映射为寄存器
- **症状**: 架构表将上下文窗口标为“寄存器”，与 Layer 2 的预算、压缩和 overflow 恢复行为矛盾，也容易与 Layer 3 Memory 混淆。
- **根因**: 2026-05-30 合并架构文档时引入了未经设计验证的类比，后续进程模型演进未同步修订该行。
- **修复**: 改为“RAM / Agent 进程工作集”，并说明 ContextManager 是内存管理器 / pager，Session messages 与 Runtime Snapshot 是 backing store，MemoryManager 是跨 Session 长期存储。

## 最终状态

### Why

`docs/ARCHITECTURE.md` 将上下文窗口映射为“寄存器”，但实际 Context 层管理的是容量受限、可压缩、可恢复的 Agent 消息工作集，更接近 RAM。错误类比还会混淆 Context、Session snapshot 与跨 Session Memory 的职责边界。

### What Changes

- 将“上下文窗口”的 OS 映射修正为 `RAM / Agent 进程工作集`。
- 补充 ContextManager、Session / Runtime Snapshot、MemoryManager 的内存层级映射。
- 明确“Memory”在 dscode 中指跨 Session 持久化知识，不等同于上下文窗口。
- 记录该映射来自当前实现语义，避免后续继续沿用无依据的“寄存器”类比。

### Capabilities

#### New Capabilities

- `architecture-documentation`: 定义架构文档中的 Agent as OS 类比必须与组件的容量、生命周期和持久化语义一致。

#### Modified Capabilities

无。

### Impact

- 修改 `docs/ARCHITECTURE.md` 的设计哲学映射表及相邻说明。
- 不修改运行时代码、配置、API、存储格式或用户界面。
