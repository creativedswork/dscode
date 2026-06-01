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
- **THEN** it calls `this.configStore.setMcpServers(mcpServers)` (or `setMcpServers([])` when no servers) and notifies the UI via `this.ui.setMcpManager()` and `this.ui.pushMcpState?.()`

### Requirement: Harness registers onChange with UI backend
The `Harness.run()` method SHALL register a ConfigWatch onChange listener that calls `this.ui.onConfigChange?.()` so that every config mutation automatically notifies the UI backend.

#### Scenario: onChange registration
- **WHEN** `harness.run()` is called
- **THEN** `this.configStore.onChange(() => this.ui.onConfigChange?.())` is registered

#### Scenario: Config mutation triggers UI notification
- **WHEN** any ConfigWatch setter is invoked (setModelConfig, setApiKey, setProjectPath, etc.)
- **THEN** `this.ui.onConfigChange?.()` is called, allowing each UI backend to react appropriately
