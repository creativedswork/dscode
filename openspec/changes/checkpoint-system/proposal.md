## Why

当前 `dscode` 的文件编辑协议（到 4.1）已经覆盖了单次 edit 的安全性（shadow apply、sanity check、batch atomicity），但缺少一个根本机制：**编辑前保存快照，编辑后按结果决定提交还是回退**。这使得 sanity check 只能"报告可能坏了"而无法"恢复"，且 `edit`/`write_file`/`bash` 混合写同一文件时没有任何跟踪与保护。4.2 文档的核心洞察——"不在不可信状态上继续编辑"——需要一个 checkpoint 机制作为基础设施。

## What Changes

- 新增 `CheckpointManager` 模块，基于 `.dscode/checkpoints/` 纯文件系统方案，不依赖 git
- 每次 `edit` 前自动保存快照；sanity check 通过后 commit，失败则 rollback 并拒绝本次编辑
- `write_file` / `overwrite_file` 也接入 checkpoint，写前保存快照
- 引入 `base_commit` 只读捕获（从 git 获取，非硬依赖），为后续基线卫生铺路
- 引入 `FileWriteTracker` 宽松模式：检测混合写手但不强制拒绝，通过响应中的 `baseline_continuity` 字段告知 agent
- **BREAKING**: edit 成功响应的 `details` 新增 `baseline_continuity` 和 `writer_type` 字段

## Capabilities

### New Capabilities

- `checkpoint-manager`: 文件快照的保存、回退、提交与脏状态检测，基于 `.dscode/checkpoints/{session-id}/` 目录
- `file-write-tracker`: 文件级写手追踪（宽松模式），记录最近写入者类型，检测混合写手但不强制拒绝

### Modified Capabilities

- `edit-tool`: 编辑前自动 checkpoint，sanity check 失败时 rollback 并拒绝；成功响应新增 `baseline_continuity` 和 `writer_type`
- `invalidation-contract`: 成功响应中的 invalidation contract 扩展，增加 `baseline_continuity` 字段
- `hashline-read`: `read_file(hashes: true)` 响应中可选返回当前文件的 checkpoint 状态

## Impact

- 新增 `src/checkpoint/` 模块（types, checkpoint-manager, write-tracker, base-commit, store/interface, store/fs-store, index）
- 修改 `src/drivers/edit.ts`（edit 流程中接入 checkpoint）
- 修改 `src/drivers/fs.ts`（write_file/overwrite_file 接入 checkpoint）
- 修改 `src/core/harness.ts`（初始化 CheckpointManager，捕获 base_commit）
- 新增 `tests/drivers/checkpoint.test.ts`
- `.dscode/checkpoints/` 目录加入 `.gitignore`
