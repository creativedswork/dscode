## 1. ToolRegistry re-entry support

- [x] 1.1 Add `clearMcpEntries()` private method that removes all MCP-sourced entries from `allTools`, clears `deferredToolNames`, and clears `discoveredToolNames`
- [x] 1.2 Call `clearMcpEntries()` at the start of `initialize()` before rebuilding from DriverRegistry

## 2. Harness MCP reload fix

- [x] 2.1 In `updateProjectPath()`, after `mcpManager.registerDrivers(this.driverRegistry)`, call `this.toolRegistry.initialize(this.makeSkillTool(), ...)` with always-load names and app-only names from the new MCP manager
- [x] 2.2 Move `this.agent.state.tools = this.toolRegistry.buildToolsForRequest()` to after the `toolRegistry.initialize()` call
- [x] 2.3 Merge user-level settings (`loadScopedSettings(userSettingsPath())`) with project settings when loading MCP config in `updateProjectPath()`

## 3. Verification

- [x] 3.1 Verify `npm run typecheck` passes
- [ ] 3.2 Manual test: switch project path via `/config cwd`, call an MCP tool, confirm it works
