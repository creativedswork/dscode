## 1. CheckpointManager 核心模块

- [x] 1.1 创建 `src/drivers/checkpoint.ts`，实现 `CheckpointManager` 类
- [x] 1.2 实现 `save(filePath, writerType)`: 复制文件到 `.dscode/checkpoints/{sessionId}/{safeFileName}-{ts}/original`，写入 `meta.json`
- [x] 1.3 实现 `rollback(filePath)`: 从 checkpoint 恢复文件，清理 checkpoint 目录
- [x] 1.4 实现 `commit(filePath)`: 清理指定文件的 checkpoint 目录
- [x] 1.5 实现 `isDirty(filePath)` / `listDirty()`: 脏状态查询
- [x] 1.6 实现 `getBaseCommit()`: 初始化时从 `git rev-parse HEAD` 只读获取（失败则 `"unknown"`）
- [x] 1.7 实现 `cleanup()`: 会话结束时清理所有 checkpoint 目录

## 2. FileWriteTracker 模块

- [x] 2.1 在 `checkpoint.ts` 中实现 `FileWriteTracker` 类
- [x] 2.2 实现 `recordWrite(filePath, writerType)`: 记录最近写入者
- [x] 2.3 实现 `getWriter(filePath)` / `getContinuity(filePath, currentWriter)`: 返回 `"clean"` 或 `"mixed"`
- [x] 2.4 实现 `markExternalWrite(filePath)`: bash 执行后标记文件为外部写入
- [x] 2.5 `FileWriteTracker` 与 `CheckpointManager` 共享 session 生命周期

## 3. edit 工具接入 checkpoint

- [x] 3.1 修改 `edit.ts` 的 `execute` 函数，编辑前调用 `checkpointManager.save()` + `writeTracker.recordWrite()`
- [x] 3.2 sanity check `"suspicious"` 时：回退 checkpoint + 拒绝编辑（返回 `safety_check_failed` 错误）
- [x] 3.3 sanity check `"clean"` 时：commit checkpoint
- [x] 3.4 编辑前调用 `writeTracker.getContinuity()`，在成功响应的 `details` 中加入 `baseline_continuity` 和 `writer_type`

## 4. write_file / overwrite_file 接入 checkpoint

- [x] 4.1 修改 `fs.ts` 的 `write_file`，写前 checkpoint + recordWrite，成功后 commit
- [x] 4.2 修改 `fs.ts` 的 `overwrite_file`，写前 checkpoint + recordWrite，成功后 commit
- [x] 4.3 `write_file` / `overwrite_file` 的 `details` 加入 `baseline_continuity` 和 `writer_type`

## 5. read_file 接入 checkpoint 状态

- [x] 5.1 修改 `fs.ts` 的 `read_file`，当 `hashes: true` 时在 `details` 中返回 `is_dirty` 和 `last_writer`

## 6. Harness 集成

- [x] 6.1 修改 `src/core/harness.ts`，在 `initialize()` 中创建 `CheckpointManager` 和 `FileWriteTracker` 实例
- [x] 6.2 将 `CheckpointManager` 和 `FileWriteTracker` 注入到 driver 工具中（通过模块级单例）
- [x] 6.3 在 harness 关闭时调用 `checkpointManager.cleanup()`

## 7. 测试

- [x] 7.1 创建 `tests/drivers/checkpoint.test.ts`，覆盖 CheckpointManager 所有方法
- [x] 7.2 创建 FileWriteTracker 测试（可在同一文件或独立文件）
- [x] 7.3 更新 `tests/drivers/edit.test.ts`，验证 checkpoint + rollback 行为
- [x] 7.4 验证 `safety_check_failed` 错误时文件被正确回退

## 8. 基础设施

- [x] 8.1 在 `.gitignore` 中加入 `.dscode/checkpoints/`
