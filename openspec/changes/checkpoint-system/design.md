## Context

当前 dscode 的文件操作工具（`edit`、`write_file`、`overwrite_file`、`bash`）都在执行后直接落盘，没有快照/回退机制。`edit` 的 sanity check 只能"检测并报告"问题，但文件已经写入，无法恢复。

4.2 文档要求引入基线与混合写手安全，核心是 checkpoint → apply → verify → commit/rollback 的闭环。本设计提供一个最小但可扩展的 checkpoint 方案，用 `.dscode/checkpoints/` 纯文件系统实现，不依赖 git。

`base_commit` 在启动时从 git 只读获取，不写入 git。这为后续（P0-1 ~ P0-3）基线卫生提供基础。

混合写手采用"宽松模式"：检测并标记，不强制拒绝。信息通过响应中的 `baseline_continuity` 和 `writer_type` 字段透传给 agent，由 agent 自行决定后续策略。

## Goals / Non-Goals

**Goals:**
- 每次 `edit` 前自动保存文件快照；sanity check 失败时回退并拒绝
- `write_file` / `overwrite_file` 写前保存快照（全量写入是明确的意图，sanity check 不适用，但 checkpoint 保留回退能力）
- Checkpoint 目录结构支持 session 隔离，为多轮编辑和未来的 rollback-to-checkpoint 铺路
- `FileWriteTracker` 记录每个文件的最近写入者类型，宽松检测混合写手
- 从 git 只读获取 `base_commit`，非硬依赖
- 模块设计保证后续可扩展（基线卫生、single-writer 硬拒绝等）

**Non-Goals:**
- 不使用 git stash / checkout / worktree（避免破坏用户未提交工作）
- 不强制拒绝混合写手（宽松模式）
- 不实现 session 级别的 checkpoint 链（当前只需最近一次快照）
- 不拦截 `bash` 工具的文件写入（黑盒，无法追踪）
- 不做跨 session 的 checkpoint 持久化

## Decisions

### 1. 纯文件系统 checkpoint，不依赖 git

**选择**: `.dscode/checkpoints/{sessionId}/` 目录下保存文件副本。

**备选**: 使用 `git stash` / `git checkout` 回退。

**理由**: git 操作会破坏用户未提交的更改。纯文件系统方案隔离、可预测、不干扰用户的 git 工作流。`base_commit` 只读获取不影响。

### 2. Checkpoint 粒度为 per-operation（每次编辑前一个快照）

**选择**: 每次 `edit`/`write_file` 调用前，对该文件创建一个 checkpoint。

**备选**: per-file 仅首次编辑时 checkpoint，或 per-session 单一全局快照。

**理由**: per-operation 粒度保证每次操作都有独立回退点。如果连续 3 次 edit，第 3 次失败可以回退到第 2 次完成后的状态（而不是回退到 3 次之前）。

### 3. 目录结构：扁平 + meta.json

**选择**:
```
.dscode/checkpoints/{sessionId}/
  {safeFileName}-{timestamp}/
    original          ← 完整文件副本
    meta.json         ← { filePath, baseCommit, writerType, timestamp, fileVersion }
```

**备选**: 在文件名中编码信息（如 `checkpoint-{hash}-{ts}.bak`）。

**理由**: 目录结构支持附加元数据（meta.json），为后续扩展（tracking writer chain、baseline_continuity 计算等）留空间。

### 4. FileWriteTracker 宽松模式

**选择**: 记录每个文件最近写入者类型（`edit`/`write_file`/`overwrite_file`/`bash`），在 `edit` 响应中通过 `baseline_continuity` 报告状态。不拒绝写入。

**备选**: 严格拒绝（`bash` 后禁止 `edit` 同一文件）。

**理由**: `bash` 是黑盒，无法精确追踪改了什么；agent 可能需要 `bash`+`edit` 交替使用。宽松模式让 agent 知情（`baseline_continuity: "mixed"`），但不阻断工作流。后续可按需升级为严格模式。

### 5. base_commit 只读获取

**选择**: 在 `Harness.initialize()` 时尝试 `git rev-parse HEAD`，失败则标记为 `"unknown"`。

**理由**: 非硬依赖，不阻断非 git 仓库使用。为后续基线卫生检测提供基础数据。

### 6. CheckpointManager 生命周期

**选择**: 与 Harness 生命周期绑定。`initialize()` 时创建，会话结束时可选清理成功的 checkpoints。

**理由**: Harness 已管理 SessionManager、PermissionManager 等，CheckpointManager 自然加入同一生命周期。

### 7. CheckpointStore 接口抽象 I/O

**选择**: CheckpointManager 通过 `CheckpointStore` 接口委托所有持久化操作，不直接读写文件系统。

**备选**: CheckpointManager 直接调用 `node:fs`。

**理由**:
- 解耦语义（save/rollback/commit）与存储实现（文件系统 / DB / S3）
- 支持 mock Store 进行纯逻辑测试
- 后续扩展 MCP 状态快照、Response 快照时只需新增 Store 实现，Manager 无需改动

**模块结构**:
```
src/checkpoint/
├── index.ts                  # 模块入口 + 单例生命周期
├── types.ts                  # WriterType, BaselineContinuity, CheckpointMeta
├── checkpoint-manager.ts     # CheckpointManager（编排：save→verify→commit/rollback）
├── write-tracker.ts          # FileWriteTracker（写手追踪，宽松模式）
├── base-commit.ts            # git rev-parse（独立职责）
└── store/
    ├── interface.ts          # CheckpointStore 接口
    └── fs-store.ts           # FileSystemCheckpointStore（本地 .dscode/checkpoints/）
```

**CheckpointStore 接口**:
```typescript
interface CheckpointStore {
  save(meta: CheckpointMeta, content: Buffer | null): void;
  load(filePath: string): { meta: CheckpointMeta; content: Buffer | null } | null;
  delete(filePath: string): void;
  list(): CheckpointMeta[];
  clear(): void;
}
```

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| 大文件每次编辑都复制完整副本，磁盘 I/O 开销 | 当前限制 read_file 最大 2MB，编辑的文件通常较小。后续可优化为只保存 diff |
| `bash` 修改文件后 checkpoint 状态不一致 | `bash` 执行后标记涉及文件为 dirty（通过 FileWriteTracker 的启发式检测），要求 agent 重新 read |
| 多次快速编辑累积大量 checkpoint 目录 | 每次 commit 后立即清理该文件 checkpoint；会话结束后统一清理 |
| 进程崩溃导致 checkpoint 残留 | 会话启动时自动清理旧 session 的 checkpoint（基于 maxAge） |

## Open Questions

1. `bash` 执行后如何启发式判断修改了哪些文件？——当前方案：不做启发式，只在 agent 显式调用 `write_file`/`edit` 时通过 `baseline_continuity` 报告。后续可考虑对比 mtime。
2. 是否需要跨 session 的 checkpoint 持久化？——当前不需要，session 结束后清理。后续 4.2 完整实施时再考虑。
