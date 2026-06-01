# Tasks

## 1. 创建 ConfigWatch

- [x] 创建 `src/core/config-watch.ts`
- [x] 实现 `ConfigWatch` 类：constructor、get、onChange、emit
- [x] 实现 `setModelConfig(provider, modelId, thinkingLevel)`
- [x] 实现 `setThinkingLevel(level)`
- [x] 实现 `setApiKey(key)`
- [x] 实现 `setProjectPath(path)`
- [x] 实现 `setVision(vision)` 和 `updateVision(patch)`
- [x] 实现 `setMcpServers(servers)`
- [ ] 单元测试：验证 onChange 在每次 set* 后触发，验证 get 返回只读快照

## 2. 扩展 UiBackend 接口

- [x] 在 `src/ui/backend.ts` 的 `UiBackend` 接口中新增 `onConfigChange?(): void`
- [x] 确保现有实现（TuiBackend、WebUiBackend）的类型兼容（可选方法无需立即实现）

## 3. 改造 Harness

- [x] `Harness` 构造函数：`new ConfigWatch(rawConfig)` → 保存 `this.configStore`，`this.config` 指向内部对象
- [x] `Harness.run()`：注册 `this.configStore.onChange(() => this.ui.onConfigChange?.())`
- [x] `updateProjectPath()`：`this.config.projectPath = resolvedPath` → `this.configStore.setProjectPath(resolvedPath)`
- [x] `setProvider()`：3 行 direct mutation → `this.configStore.setModelConfig(providerId, defaultModelId, level)`
- [x] `setModel()`：`this.config.modelId = modelId` → `this.configStore.setModelConfig(this.config.provider, modelId, this.config.thinkingLevel)`
- [x] `setThinking()` (public)：`this.config.thinkingLevel = level` → `this.configStore.setThinkingLevel(level)`
- [x] `setThinking()` (internal / `this.agent.state.thinkingLevel`)：保持不变（agent state 不属于 ConfigWatch 范围）
- [x] `initMcpManager()`：`this.config.mcp = mcpServers` → `this.configStore.setMcpServers(mcpServers)`
- [x] `HarnessConfig` 只读访问（`this.config.provider`、`this.config.projectPath` 等）保持不变

## 4. 实现 WebUiBackend.onConfigChange

- [x] `WebUiBackend` 构造函数：接收 `configStore: ConfigWatch`（通过 `WebUiOptions`）
- [x] 实现 `onConfigChange()`：`this.broadcast({ type: "config", data: this.buildConfigData() })`
- [x] `handleConfig` 中各 set 改为 ConfigWatch 方法：
  - [x] `set_key` → `this.configStore.setApiKey(cmd.value)`
  - [x] `set_provider` → 保留 `saveUserConfig` + `this.configStore.setModelConfig(...)`
  - [x] `set_vision_provider` → `this.configStore.updateVision({ provider: vp })`
  - [x] `set_vision_model` → `this.configStore.updateVision({ model: vm })`
  - [x] `set_vision_key` → `this.configStore.updateVision({ key: vk })`
  - [x] `set_vision_delete` → `this.configStore.setVision(undefined)`

## 5. 改造 commands.ts

- [x] 在 `SlashCommandContext` 或参数中传入 `configStore: ConfigWatch`
- [x] `/config key`：`ctx.config.apiKey = key` → `ctx.configStore.setApiKey(key)`
- [x] `/config vision-provider`：`ctx.config.vision = v` → `ctx.configStore.updateVision({ provider })`
- [x] `/config vision-model`：同上 → `ctx.configStore.updateVision({ model })`
- [x] `/config vision-key`：同上 → `ctx.configStore.updateVision({ key })`

## 6. 改造 TuiBackend / TuiDeps

- [x] `TuiDeps` 接口新增 `configStore: ConfigWatch`
- [x] `TuiBackend` 构造函数或其他位置保存 `configStore` 引用（供 commands.ts 使用）
- [x] 实现 `onConfigChange()`：空操作（共享引用已同步），可选留日志

## 7. 修复 Web 前端 Bug

- [x] `web/src/components/App.tsx` 的 `handleEvent` switch 中新增 `case "config":`
- [x] `case "config"` 中调用 `setConfig(event.data)`
- [x] 确保所有通过 ConfigWatch 触发的 config 变更都能在前端即时反映

## 8. 更新 main.ts 接入层

- [x] `loadConfig()` 返回 config 后，由 Harness 内部创建 ConfigWatch
- [x] `WebUiOptions` 新增 `configStore` 字段，`main.ts` 传入
- [x] 验证 `--web` 模式和 CLI 模式均正常工作

## 9. 清理与验证

- [x] 全量 typecheck：`npm run typecheck`
- [x] 全量测试：`npm test`（279/281 pass，2 个失败为已有的 addToHistory 问题，与本次改动无关）
- [ ] 手动验证 Web UI：设置 cwd → 即时生效
- [ ] 手动验证 TUI：`/config cwd` → 即时生效
- [ ] 验证 session 切换后 config 状态同步正确
- [ ] 验证 vision 配置的增/改/删各类操作
