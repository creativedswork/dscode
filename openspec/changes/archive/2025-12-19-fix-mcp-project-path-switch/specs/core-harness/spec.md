## ADDED Requirements

### Requirement: updateProjectPath re-initializes ToolRegistry after MCP reload
After `updateProjectPath()` creates a new `MCPManager` and registers its drivers into `DriverRegistry`, it SHALL call `this.toolRegistry.initialize()` with the current skill tool, always-load names, and app-only names to rebuild the tool index from the updated DriverRegistry state. It SHALL then call `this.toolRegistry.buildToolsForRequest()` to update `this.agent.state.tools`.

#### Scenario: ToolRegistry re-initialized after MCP reload
- **WHEN** `updateProjectPath()` completes MCP driver registration
- **THEN** `this.toolRegistry.initialize(this.makeSkillTool(), ...)` is called before `this.toolRegistry.buildToolsForRequest()`

#### Scenario: Agent tools reflect new MCP state
- **WHEN** `updateProjectPath()` completes
- **THEN** `this.agent.state.tools` contains AgentTool objects from the new MCPManager, not stale objects from the old (shutdown) MCPManager

### Requirement: updateProjectPath merges user-level MCP config
When loading MCP server configurations in `updateProjectPath()`, the harness SHALL merge user-level settings from `~/.dscode/settings.json` with the new project-level settings, giving project-level settings precedence. This SHALL be consistent with the merge behavior in `loadConfig()`.

#### Scenario: User-level MCP servers preserved
- **WHEN** `updateProjectPath()` is called and user-level settings contain MCP server configurations
- **THEN** those user-level MCP servers are included in the new `MCPManager` alongside project-level MCP servers

#### Scenario: Project-level MCP overrides user-level
- **WHEN** `updateProjectPath()` is called and both user-level and project-level settings define an MCP server with the same name
- **THEN** the project-level configuration takes precedence

## MODIFIED Requirements

### Requirement: MCP reload uses configStore
- **WHEN** `updateProjectPath` reloads MCP servers for a new project
- **THEN** it calls `this.configStore.setMcpServers(mcpServers)` (or `setMcpServers([])` when no servers), notifies the UI via `this.ui.setMcpManager()` and `this.ui.pushMcpState?.()`, re-initializes `this.toolRegistry` via `initialize()`, and updates `this.agent.state.tools` via `buildToolsForRequest()`
