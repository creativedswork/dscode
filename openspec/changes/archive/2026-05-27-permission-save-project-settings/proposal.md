## Why

当前权限弹窗的 "Save to settings" 功能将规则持久化到用户级 `~/.dscode/settings.json`。这导致：

- 权限规则与工程无关，无法随仓库共享给团队成员
- 同一用户的不同工程无法拥有独立的权限策略
- 工程级 `permissions.allow/deny` 已支持加载读取，但写入口仍缺失

## What Changes

- **`PermissionManager`**：`persistRule()` 改为写入工程级 `$PROJECT/.dscode/settings.json`
- **`config.ts`**：新增 `saveProjectSettings(projectPath, partial)` 函数，与已有的 `saveUserSettings` 对称
- **`harness.ts`**：构造 `PermissionManager` 时传入 `projectPath`
- 无工程目录时自动创建 `.dscode/` 目录（`saveJsonSafe` 已有 `mkdirSync(recursive: true)`）

## Capabilities

### Modified Capabilities

- `permission-persist-ui`：persistRule 的目标路径从用户级改为工程级

### New Capabilities

- `permission-project-persist`：工程级 settings 写入规范

## Impact

- UI 无需更改（按钮文案、"Save to settings" 弹窗逻辑不变）
- 已有用户级 `~/.dscode/settings.json` 中的旧规则不动，不迁移
- 加载时工程级优先于用户级（`config.ts:143` 已有合并逻辑），新规则生效无缝
