## ADDED Requirements

### Requirement: Worktree 隔离
系统 SHALL 支持通过 `createAgentWorktree(slug)` 为代理创建 Git Worktree，提供文件系统隔离。

Worktree 创建流程 SHALL：
1. 在 `.claude/worktrees/agent-<slug>/` 创建临时分支
2. 子代理的所有文件操作在 Worktree 中进行
3. 代理完成后检测是否有变更：
   - 无变更：自动删除 Worktree
   - 有变更：保留 Worktree，返回路径供通知

#### Scenario: Worktree 创建
- **WHEN** 代理调用使用 `isolation: "worktree"`
- **THEN** 代理运行在独立的 Git Worktree 中，文件变更不影响主工作区

#### Scenario: 无变更清理
- **WHEN** 代理完成且 Worktree 中无文件变更
- **THEN** Worktree 被自动清理（删除分支和目录）

#### Scenario: 有变更保留
- **WHEN** 代理在 Worktree 中创建或修改了文件
- **THEN** Worktree 被保留，路径包含在完成通知的 `<worktree-path>` 中

### Requirement: CWD 覆写
系统 SHALL 支持通过 `cwd` 参数或 Worktree 路径覆写子代理的工作目录。

覆写通过 `runWithCwdOverride(path, fn)` 实现，在 fn 执行期间 `getCwd()` 返回覆写路径。

#### Scenario: cwd 覆写
- **WHEN** 代理调用使用 `cwd: "/path/to/subproject"`
- **THEN** 代理的所有文件操作基于 `/path/to/subproject`

### Requirement: Worktree 路径翻译
当 Fork 子代理在 Worktree 中运行时，系统 SHALL 注入路径翻译通知，指导子代理将原始路径映射到 Worktree 路径。

#### Scenario: 路径翻译通知
- **WHEN** Fork 子代理运行在 Worktree 中
- **THEN** 子代理收到包含原始路径 → Worktree 路径映射指南的 user 消息

### Requirement: Worktree 并发保护
系统 SHALL 通过 bumping Worktree 目录的 mtime 来防止其他进程清理正在使用的 Worktree。

#### Scenario: mtime 刷新
- **WHEN** 代理恢复时 worktree 仍存在
- **THEN** Worktree 目录的 mtime 被更新为当前时间
