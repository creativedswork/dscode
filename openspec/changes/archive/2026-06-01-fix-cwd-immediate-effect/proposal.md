## Why

`/config cwd` 目前需要重启才能生效，且 cwd 被持久化到全局 `~/.dscode/config.json` 中——每次 dscode 启动不从当前目录而是从全局配置读取 cwd，导致多项目切换时 cwd 互相覆盖、行为不可预期。应改为：启动时以当前目录为 cwd，`/config cwd` 立即生效无需重启。

## What Changes

- **BREAKING**: 从 `~/.dscode/config.json` 移除 `cwd` 和 `cwdProjectPath` 字段，不再持久化 cwd
- 启动时 `projectPath` 默认使用 `process.cwd()`（`DSCODE_PROJECT_PATH` 环境变量仍可 override）
- `/config cwd <path>` 立即调用 `process.chdir()` 切换工作目录，并热更新运行中的 Harness 状态（session manager、memory manager、skills、MCP servers）
- Web 后端的 `set_project_path` 同步调整，同样立即生效、不再写 config.json

## Capabilities

### New Capabilities
<!-- No new capabilities — this is a bugfix/refinement of existing behavior -->

### Modified Capabilities
- `shared-config-model`: `ConfigData.projectPath` 的语义从"从全局配置恢复的持久化路径"变为"当前会话的工作目录，启动时默认为 `process.cwd()`，可通过 `/config cwd` 运行时修改"

## Impact

- `src/core/config.ts`: 删除 `saveUserProjectCwd` 函数；`loadConfig()` 中移除从 `userConfig.cwd` 恢复 projectPath 的逻辑
- `src/ui/commands.ts`: `/config cwd` 改为立即 `process.chdir()` + 更新 `config.projectPath` + 调用 harness 热重载
- `src/core/harness.ts`: 可能需要暴露/增强 `updateProjectPath` 方法供 TUI 使用
- `src/ui/web/web-backend.ts`: `set_project_path` 移除 `saveUserProjectCwd` 调用
- `~/.dscode/config.json`: 旧字段 `cwd`/`cwdProjectPath` 将被忽略（不自动迁移）
