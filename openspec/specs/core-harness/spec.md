## ADDED Requirements

### Requirement: Harness uses ConfigWatch for all config mutations
The `Harness` class SHALL create a `ConfigWatch` instance from the raw `HarnessConfig` and route all configuration mutations through ConfigWatch setter methods. External code MAY still read `this.config` directly since it references the same internal object that ConfigWatch manages.

#### Scenario: Harness constructor creates ConfigWatch
- **WHEN** `Harness` is instantiated with a `HarnessConfig`
- **THEN** `this.configStore` is set to `new ConfigWatch(config)` and `this.config` points to the same internal object

#### Scenario: setModel uses configStore
- **WHEN** `harness.setModel(modelId)` is called
- **THEN** it calls `this.configStore.setModelConfig(this.config.provider, modelId, thinkingLevel)` instead of directly assigning `this.config.modelId` and `this.config.thinkingLevel`

#### Scenario: setProvider uses configStore
- **WHEN** `harness.setProvider(providerId)` is called
- **THEN** it calls `this.configStore.setModelConfig(providerId, defaultModelId, thinkingLevel)` instead of separately assigning `this.config.provider`, `this.config.modelId`, and `this.config.thinkingLevel`

#### Scenario: setThinking uses configStore
- **WHEN** `harness.setThinking(level)` is called
- **THEN** it calls `this.configStore.setThinkingLevel(level)` instead of directly assigning `this.config.thinkingLevel`

#### Scenario: updateProjectPath uses configStore
- **WHEN** `harness.updateProjectPath(resolvedPath)` sets the project path
- **THEN** it calls `this.configStore.setProjectPath(resolvedPath)` instead of directly assigning `this.config.projectPath`

#### Scenario: MCP reload uses configStore
- **WHEN** `updateProjectPath` reloads MCP servers for a new project
- **THEN** it calls `this.configStore.setMcpServers(mcpServers)` (or `setMcpServers([])` when no servers), notifies the UI via `this.ui.setMcpManager()` and `this.ui.pushMcpState?.()`, re-initializes `this.toolRegistry` via `initialize()`, and updates `this.agent.state.tools` via `buildToolsForRequest()`

### Requirement: Harness registers onChange with UI backend

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

The `Harness.run()` method SHALL register a ConfigWatch onChange listener that calls `this.ui.onConfigChange?.()` so that every config mutation automatically notifies the UI backend.

#### Scenario: onChange registration
- **WHEN** `harness.run()` is called
- **THEN** `this.configStore.onChange(() => this.ui.onConfigChange?.())` is registered

#### Scenario: Config mutation triggers UI notification
- **WHEN** any ConfigWatch setter is invoked (setModelConfig, setApiKey, setProjectPath, etc.)
- **THEN** `this.ui.onConfigChange?.()` is called, allowing each UI backend to react appropriately
