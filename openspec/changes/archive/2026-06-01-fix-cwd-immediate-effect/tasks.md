## 1. Core: Remove cwd from global config

- [x] 1.1 `src/core/config.ts`: 删除 `saveUserProjectCwd` 函数及其导出
- [x] 1.2 `src/core/config.ts` `loadConfig()`: 移除从 `userConfig.cwd`/`cwdProjectPath` 读取并匹配的逻辑（第 143-161 行），`projectPath` 直接使用 `startupPath`
- [x] 1.3 `src/core/config.ts` `loadConfig()`: 移除 `saveUserProjectCwd(startupPath, projectPath)` 调用（第 158 行）
- [x] 1.4 确认 `~/.dscode/config.json` 中旧的 `cwd`/`cwdProjectPath` 字段不再被写入（读入时被忽略，自然衰减）

## 2. Harness: 增强 updateProjectPath 支持 TUI 热重载

- [x] 2.1 `src/core/harness.ts`: `updateProjectPath` 增加 `process.chdir(resolvedPath)` 调用
- [x] 2.2 `src/core/harness.ts`: 切换路径前保存当前 session（`sessionManager.trySaveSession(this.agent)`）
- [x] 2.3 `src/core/harness.ts`: 切换路径后重新加载 skills（`skillManager` 需要 `reloadDirs` 方法，见任务 3）
- [x] 2.4 `src/core/harness.ts`: 切换路径后重新加载 MCP servers（`mcpManager.shutdown()` + 从新 `.dscode/settings.json` 读取并重连）
- [x] 2.5 `src/core/harness.ts`: 切换路径后刷新 system prompt（已有）
- [x] 2.6 `src/core/harness.ts`: 返回成功/失败状态，供 UI 层展示提示信息

## 3. SkillManager: 增加 reloadDirs 方法

- [x] 3.1 `src/skills/manager.ts`: 存储 `userSkillsDir` 和 `projectSkillsDir` 作为实例字段
- [x] 3.2 `src/skills/manager.ts`: 新增 `reloadDirs(userSkillsDir, projectSkillsDir)` 方法——清空 manifests、重新扫描、重新激活当前已激活的 skills
- [x] 3.3 `src/skills/manager.ts`: 如新路径中某 skill 不存在，自动 deactivate 并在 `getSystemPromptSection` 中不再列出

## 4. TUI: /config cwd 立即生效

- [x] 4.1 `src/ui/commands.ts` `/config cwd` 无参数时：显示当前 `ctx.config.projectPath` 而非报错
- [x] 4.2 `src/ui/commands.ts` `/config cwd <path>`: 调用 `resolve(path)` 验证路径存在
- [x] 4.3 `src/ui/commands.ts` `/config cwd <path>`: 调用 `ctx.harness.updateProjectPath(resolvedPath)` 执行热切换
- [x] 4.4 `src/ui/commands.ts` `/config cwd <path>`: 根据返回值显示成功/失败提示（移除 "restart required" 文案）
- [x] 4.5 `src/ui/commands.ts`: 删除 `saveUserConfig`/`saveUserProjectCwd` 的 import（如果不再需要）

## 5. Web: 同步调整

- [x] 5.1 `src/ui/web/web-backend.ts`: `set_project_path` 移除 `saveUserProjectCwd(this.config.startupPath, cwd)` 调用
- [x] 5.2 `src/ui/web/web-backend.ts`: `set_project_path` 委托给 `this.harness.updateProjectPath(cwd)`（如尚未统一）
- [x] 5.3 确认 Web 端 cwd 切换后前端能收到更新后的 `ConfigData`

## 6. 验证

- [ ] 6.1 手动测试：启动 dscode，确认 `projectPath` = 当前目录
- [ ] 6.2 手动测试：`/config cwd /tmp` 立即生效，`/config` 显示新路径
- [ ] 6.3 手动测试：`/config cwd` 无参数显示当前路径
- [ ] 6.4 手动测试：`DSCODE_PROJECT_PATH=/other dscode` 仍可 override
- [ ] 6.5 手动测试：切换 cwd 后 session 被保存，可 `/session list` 查看旧项目 session
- [ ] 6.6 手动测试：Web 模式 `set_project_path` 同样立即生效
- [x] 6.7 `npm run typecheck` 通过
- [x] 6.8 `npm test` 通过
