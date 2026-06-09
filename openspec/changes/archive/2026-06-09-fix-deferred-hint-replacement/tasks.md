## 1. 修复

- [x] 1.1 在 `Harness.initialize()` 中，将 `const systemPrompt = this.baseSystemPrompt;` 改为 `const systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());`
- [x] 1.2 在 `Harness.run()` MCP 连接后，补充 `agent.state.systemPrompt` 的 deferred hint 更新 + `dumpDebugPrompt()` 调用

## 2. 验证

- [x] 2.1 `npm run typecheck` 通过
- [x] 2.2 `npm start -- --debug` 确认 dump/system-prompt.md 中不再出现 `__DEFERRED_HINT__`，且 Deferred Tools 类别正确出现 MCP 工具列表
