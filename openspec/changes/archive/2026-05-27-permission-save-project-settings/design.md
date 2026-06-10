## Context

当前权限持久化管线：

```
persistRule(rule)
  → loadUserSettings()        // ~/.dscode/settings.json
  → saveUserSettings(merged)  // ~/.dscode/settings.json
```

期望管线：

```
persistRule(rule)
  → loadScopedSettings(projectSettingsPath(projectPath))  // $PROJECT/.dscode/settings.json
  → saveJsonSafe(path, merged)                            // $PROJECT/.dscode/settings.json
```

基础设施已就绪：`projectSettingsPath()`、`loadScopedSettings()`、`saveJsonSafe()` 均已存在。仅缺 `saveProjectSettings()` 封装和 `PermissionManager` 拿到 `projectPath`。

## Goals / Non-Goals

**Goals:**
- `persistRule` 写入工程级 settings
- 无 `.dscode/` 目录时自动创建
- 与现有加载合并逻辑兼容

**Non-Goals:**
- 不迁移已有用户级旧规则
- 不改 UI 文案
- 不新增用户选项（工程级 vs 用户级选择）

## Decisions

### 1. `PermissionManager` 持有 `projectPath`

**决策**：`PermissionManager` 构造函数新增 `projectPath: string` 参数。

```
class PermissionManager {
  private projectPath: string;
  
  constructor(
    config: PermissionsConfig,
    promptUser: PromptUserFn,
    projectPath: string,        // ← 新增
    onBeforePrompt?: () => void,
  ) { ... }
}
```

**理由**：最简侵入路径。`Harness` 已有 `config.projectPath`，直接透传即可。

**替代方案**：通过回调注入 `(rule) => void` — 增加间接层，无必要。

### 2. `saveProjectSettings()` 封装

**决策**：在 `config.ts` 中新增函数，与 `saveUserSettings()` 对称。

```typescript
export function saveProjectSettings(
  projectPath: string,
  partial: Record<string, unknown>
): void {
  const path = projectSettingsPath(projectPath);
  const existing = loadScopedSettings(path);
  const merged = { ...existing, ...partial };
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) delete merged[k];
  }
  saveJsonSafe(path, merged);
}
```

**理由**：保持 API 一致性，`saveUserSettings` 和 `saveProjectSettings` 共享相同的 merge + null-delete 语义。

### 3. 无工程目录时的行为

**决策**：`saveJsonSafe` 已包含 `mkdirSync(dir, { recursive: true })`，`.dscode/` 不存在时自动创建。无需额外处理。

**理由**：已有基础设施覆盖此 edge case，保持简单。

### 4. persistRule 切换到工程级

**决策**：`persistRule` 使用 `loadScopedSettings(projectSettingsPath(this.projectPath))` + `saveProjectSettings(this.projectPath, ...)` 替代原有的 `loadUserSettings()` + `saveUserSettings()`。

```
private persistRule(rule: PermissionRuleConfig): void {
  const settings = loadScopedSettings(projectSettingsPath(this.projectPath));
  // ... same logic, but use saveProjectSettings(this.projectPath, ...)
}
```

**理由**：逻辑不变，仅目标路径变化。

## Risks / Trade-offs

- **风险**：纯 REPL 模式（无 project）下写入 `/dev/null` 或根目录 — 实际上 Harness 始终有 `projectPath`（来自 `cliCwd ?? process.cwd()`），这不是问题。
- **风险**：团队协作中，工程师 A 的 allow 规则提交到 git 后影响工程师 B — 这是预期行为，工程级 settings 天然适用于团队共享。

## Open Questions

无。
