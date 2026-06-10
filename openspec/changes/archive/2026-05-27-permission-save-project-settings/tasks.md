## 1. config.ts — 新增 saveProjectSettings

- [x] 1.1 在 `src/core/config.ts` 中新增 `saveProjectSettings(projectPath: string, partial: Record<string, unknown>): void`

## 2. PermissionManager — 接入 projectPath

- [x] 2.1 构造函数新增 `projectPath: string` 参数
- [x] 2.2 `persistRule()` 改用 `loadScopedSettings(projectSettingsPath(this.projectPath))` + `saveProjectSettings(this.projectPath, ...)`

## 3. Harness — 透传 projectPath

- [x] 3.1 `src/core/harness.ts` 中 `new PermissionManager(...)` 调用传入 `config.projectPath`

## 4. 验证

- [x] 4.1 运行 `npm run typecheck` 确保无类型错误
- [x] 4.2 运行 `npm test` 确保已有测试通过
