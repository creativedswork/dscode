## 1. 修正 Agent as OS 映射

- [x] 1.1 将 `docs/ARCHITECTURE.md` 中“上下文窗口 → 寄存器”修正为“RAM / Agent 进程工作集”
- [x] 1.2 在映射表后补充 ContextManager、Session / Runtime Snapshot、MemoryManager 的分层说明

## 2. 验证文档契约

- [x] 2.1 检查架构文档不再将上下文窗口称为寄存器，并与 Layer 1–3 职责保持一致
- [x] 2.2 运行 OpenSpec strict validation、Markdown 格式检查和差异检查
