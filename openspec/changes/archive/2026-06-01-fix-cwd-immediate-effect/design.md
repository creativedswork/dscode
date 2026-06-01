## Context

当前 cwd 机制：

- `~/.dscode/config.json` 中存储全局唯一的 `cwd` 和 `cwdProjectPath` 键值对
- 启动时 `loadConfig()` 检查 `cwdProjectPath === startupPath` 来决定是否使用已保存的 cwd
- `/config cwd` 只写入 config.json，提示"restart required"
- TUI 端没有热重载机制，Web 端通过 `updateProjectPath` 部分实现了热重载

核心问题：cwd 是**运行时状态**（"当前工作目录"），不应被当作**持久化配置**存储。这导致：
1. 多项目切换时互相覆盖
2. 设置 cwd 需要重启
3. 不尊重进程当前目录

## Goals / Non-Goals

**Goals:**
- 启动时 `projectPath` = `process.cwd()`（或 `DSCODE_PROJECT_PATH`），不读 config.json
- `/config cwd <path>` 立即生效：`process.chdir()` + Harness 状态热更新
- 不再向 `~/.dscode/config.json` 写入任何 cwd 相关字段
- TUI 和 Web 后端行为一致

**Non-Goals:**
- 不实现跨会话的 cwd 持久化（如有需要，未来可做 per-project 的 `.dscode/settings.json` 字段）
- 不迁移旧 `config.json` 中的 `cwd`/`cwdProjectPath` 字段（直接忽略）
- 不改变 `DSCODE_PROJECT_PATH` 环境变量的行为

## Decisions

### Decision 1: `loadConfig()` 中删除 cwd 恢复逻辑

**选择**: 直接从 `startupPath`（即 `process.cwd()`）作为 `projectPath`，移除从 `userConfig.cwd` 读取和匹配 `cwdProjectPath` 的整个 if 块。

**替代方案**: 保留读取但增加"last session"机制——过于复杂，且用户明确表示不需要持久化。

### Decision 2: `Harness.updateProjectPath()` 统一 TUI/Web 热重载

**选择**: 在 Harness 上暴露公开方法 `updateProjectPath(newPath)`，统一处理：
1. `process.chdir(newPath)`
2. `this.config.projectPath = newPath`
3. `sessionManager.updateProjectPath(dataDir, newPath)`
4. `memoryManager.updateProjectPath(dataDir, newPath)`
5. 重新加载 skills（`skillManager` 需要新增 `updateProjectPath` 或重建）
6. 重新加载 MCP servers（从新项目的 `.dscode/settings.json`）

当前 Harness 已有 `updateProjectPath` 方法（第 629 行），但它是 `private`/未导出的。需要将其提升为公开方法并增强。

**替代方案**: 在 commands.ts 中手动调用多个 manager 的 update 方法——这会导致 TUI 和 Web 代码重复。

### Decision 3: SkillManager 增加 `reloadFromPath`

**选择**: 给 SkillManager 增加 `reloadFromPath(userSkillsDir, projectSkillsDir)` 方法，用于切换项目路径后重新扫描并加载 skills。

**理由**: 当前 SkillManager 在构造时扫描 skills 目录，切换 projectPath 后需要重新扫描 `.dscode/skills/` 目录。

### Decision 4: `/config cwd` 无参数时显示当前 cwd

**选择**: 与 `/config` 无参数行为对齐——当用户只输入 `/config cwd` 不带路径时，显示当前 `projectPath` 而非报错。

**理由**: 改善 UX，用户可以先查看当前 cwd 再决定是否修改。

## Risks / Trade-offs

- **[Risk] 切换 projectPath 时 MCP server 需要重启**: MCP manager 需要 shutdown 旧的 stdio 进程并启动新的。这会短暂中断所有 MCP 工具。→ **Mitigation**: 用户主动操作 `/config cwd`，预期会有短暂中断；在 UI 给出明确的提示信息。
- **[Risk] 正在进行的 agent turn 可能使用旧路径**: 如果在 agent 执行过程中切换 cwd，文件操作可能指向错误路径。→ **Mitigation**: `/config cwd` 是用户主动命令，通常在 idle 时使用；文档说明建议在会话空闲时切换。
- **[Trade-off] 不再持久化 cwd**: 每次启动都要重新 `cd` 到目标目录再运行 dscode。→ 这是正确的默认行为，符合 CLI 工具的惯例（git、npm 等都是基于当前目录）。

## Migration Plan

1. 部署新版本
2. 旧的 `~/.dscode/config.json` 中的 `cwd`/`cwdProjectPath` 字段被忽略（不读取，不会被新版本写入覆盖）
3. 用户下次手动编辑 config.json 时可以自行删除这些字段（无害，保留也 OK）
4. 无 breaking change 需要用户手动迁移——行为变化是启动时 cwd = 进程当前目录而非上次配置的路径
