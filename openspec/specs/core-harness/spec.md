## Purpose

Central agent harness — owns agent lifecycle, session management, MCP coordination, and delegates image processing to ImagePipeline.
## Requirements
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
- **THEN** it calls `this.configStore.setMcpServers(mcpServers)` (or `setMcpServers([])` when no servers)
- **AND** SHALL emit `this.events.emit({ type: "mcp:state", servers })` to notify consumers
- **AND** SHALL re-initialize `this.toolRegistry` via `initialize()` and update `this.agent.state.tools` via `buildToolsForRequest()`
- **AND** SHALL NOT call `this.ui.setMcpManager()` or `this.ui.pushMcpState?.()`
- **AND** SHALL emit `this.events.emit({ type: "mcp:state", servers })` to notify consumers
- **AND** SHALL re-initialize `this.toolRegistry` via `initialize()` and update `this.agent.state.tools` via `buildToolsForRequest()`
The `Harness.run()` method SHALL register a ConfigWatch onChange listener that emits a `config:change` event instead of calling `this.ui.onConfigChange?.()`.

#### Scenario: onChange registration

- **WHEN** `harness.run()` is called
- **THEN** `this.configStore.onChange(() => this.events.emit({ type: "config:change", data: this.buildConfigData() }))` is registered

#### Scenario: Config mutation triggers config:change event

- **WHEN** any ConfigWatch setter is invoked
- **THEN** `this.events.emit({ type: "config:change", data })` is called, notifying all subscribers
#### Scenario: Config mutation triggers UI notification
- **WHEN** any ConfigWatch setter is invoked (setModelConfig, setApiKey, setProjectPath, etc.)
- **THEN** `this.ui.onConfigChange?.()` is called, allowing each UI backend to react appropriately

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

### Requirement: Harness implements HarnessAPI
The `Harness` class SHALL implement the `HarnessAPI` interface. All fields consumed by UI backends (agent, sessionManager, memoryManager, driverRegistry, toolRegistry, skillManager, permissionManager, contextManager, mcpManager, config, configStore) SHALL be `public readonly`. The image processing fields and methods SHALL be delegated to `this.imagePipeline`.

#### Scenario: Harness fields are public readonly
- **WHEN** `Harness` is instantiated
- **THEN** `harness.agent`, `harness.sessionManager`, `harness.driverRegistry`, etc. are accessible without type assertions


#### Scenario: Harness delegates image processing to ImagePipeline with abort support
- **WHEN** `harness.promptWithImages(text, images)` is called
- **THEN** it SHALL create a new `AbortController`, store it as `this.visionAbortController`, and call `this.imagePipeline.process(images, text, { signal: visionAbortController.signal })`
- **AND** clear `this.visionAbortController` after the call completes or throws

#### Scenario: promptWithImages handles AbortError from pipeline
- **WHEN** `this.imagePipeline.process()` throws an `AbortError`
- **THEN** `promptWithImages()` SHALL call `this.ui.setProcessing(false)` without calling `agent.prompt()`

### Requirement: HarnessAPI includes abort method
The `HarnessAPI` interface SHALL declare `abort(): void` so that UI backends (TUI, Web) can call abort through the typed interface.

#### Scenario: HarnessAPI abort declaration
- **WHEN** code references `harness.abort()` through a `HarnessAPI` type
- **THEN** TypeScript SHALL compile without type errors

### Requirement: Harness exposes abort method
The `Harness` class SHALL expose a public `abort(): void` method. When called, it SHALL abort the visionAbortController (if one is active for in-progress image pre-processing) AND call `this.agent.abort()`. The agent's abort SHALL propagate into all in-flight tool executions including MCP tool calls via the AbortSignal passed to each `AgentTool.execute()`.

#### Scenario: Abort during image pre-processing
- **WHEN** `harness.abort()` is called while `promptWithImages()` is executing inside `imagePipeline.process()`
- **THEN** the vision/OCR call SHALL be aborted via `visionAbortController.abort()`
- **AND** `agent.abort()` SHALL also be called

#### Scenario: Abort during agent loop
- **WHEN** `harness.abort()` is called while the agent loop is running (no image pre-processing active)
- **THEN** `agent.abort()` SHALL be called
- **AND** no error SHALL be thrown

#### Scenario: Abort during MCP tool execution
- **WHEN** `harness.abort()` is called while an MCP tool is executing (via the agent loop)
- **THEN** the agent's abort signal SHALL propagate through `AgentTool.execute` → `MCPManager.buildAgentTool` → `MCPClient.callTool` → `MCPClient.request`
- **AND** the in-flight MCP request SHALL be cancelled (HTTP request destroyed, or stdio cancel notification sent)
- **AND** the MCP tool promise SHALL reject with an `AbortError`

#### Scenario: Abort when idle
- **WHEN** `harness.abort()` is called while nothing is running
- **THEN** the call SHALL complete without throwing

### Requirement: Harness constructs and owns ImagePipeline
The `Harness` constructor SHALL create an `ImagePipeline` instance and store it as `this.imagePipeline`. The ImagePipeline SHALL be included in `HarnessAPI`.

#### Scenario: ImagePipeline created during Harness construction
- **WHEN** `new Harness(config)` is called

### Requirement: Harness creates and owns HarnessEventBus

The `Harness` constructor SHALL create a `HarnessEventBus` instance and store it as `this.events`. The event bus SHALL be created before any agent subscriptions or session initialization, ensuring consumers can subscribe before the first event is emitted.

#### Scenario: Event bus created in constructor

- **WHEN** `new Harness(config)` is called
- **THEN** `this.events` SHALL be a `HarnessEventBus` instance
- **AND** `this.events` SHALL be created before `this.agent` is initialized

#### Scenario: Event bus accessible as public readonly

- **WHEN** code accesses `harness.events`
- **THEN** it SHALL return the `HarnessEventBus` instance without type errors

### Requirement: Harness emits events instead of calling UiBackend directly

In `bindEvents()`, the Harness SHALL emit events via `this.events.emit(...)` instead of calling `this.ui.*` methods. Agent streaming events (`message_update`, `tool_execution_start`, `tool_execution_end`) SHALL be translated to `llm:thinking:delta`, `llm:text:delta`, `tool:start`, and `tool:end` events. Agent lifecycle events (`agent_start`, `agent_end`, `turn_end`) SHALL be translated to `turn:streaming:start`, `processing:stop`, `turn:end` events.

#### Scenario: thinking_delta emits llm:thinking:delta

- **WHEN** the agent fires a `message_update` event with a `thinking_delta` sub-event
- **THEN** Harness SHALL call `this.events.emit({ type: "llm:thinking:delta", delta })` instead of `this.ui.thinkingDelta(delta)`

#### Scenario: text_delta emits llm:text:delta

- **WHEN** the agent fires a `message_update` event with a `text_delta` sub-event
- **THEN** Harness SHALL call `this.events.emit({ type: "llm:text:delta", delta })` instead of `this.ui.textDelta(delta)`

#### Scenario: tool_execution_start emits tool:start

- **WHEN** the agent fires a `tool_execution_start` event
- **THEN** Harness SHALL call `this.events.emit({ type: "tool:start", name, args })` instead of `this.ui.toolStart(name, args)`

#### Scenario: tool_execution_end emits tool:end

- **WHEN** the agent fires a `tool_execution_end` event
- **THEN** Harness SHALL call `this.events.emit({ type: "tool:end", name, result, isError })` instead of `this.ui.toolEnd(name, result, isError)`

#### Scenario: agent_start emits turn:streaming:start

- **WHEN** the agent fires an `agent_start` event
- **THEN** Harness SHALL call `this.events.emit({ type: "turn:streaming:start" })` instead of `this.ui.startAssistantMessage()`

#### Scenario: agent_end emits processing:stop

- **WHEN** the agent fires an `agent_end` event
- **THEN** Harness SHALL call `this.events.emit({ type: "processing:stop" })` instead of `this.ui.setProcessing(false)`

#### Scenario: turn_end emits turn:end

- **WHEN** the agent fires a `turn_end` event
- **THEN** Harness SHALL call `this.events.emit({ type: "turn:end", stopReason, usage })` instead of `this.ui.finishAssistantMessage()`

### Requirement: Harness emits turn lifecycle events in promptAndSave

The `promptAndSave()` method SHALL emit `turn:start` before calling `agent.prompt()`. The `Harness.abort()` method SHALL emit `turn:abort` with `reason: "user"` when triggered by user interaction, or `reason: "system"` when triggered by shutdown/session-switch. On a non-retryable error, it SHALL emit `turn:error` with the error details.

#### Scenario: turn:start emitted before agent prompt

- **WHEN** `promptAndSave(text, images)` is called
- **THEN** `this.events.emit({ type: "turn:start" })` SHALL be called before `this.agent.prompt(text, images)`

#### Scenario: turn:error emitted on non-retryable failure

- **WHEN** `promptAndSave()` catches a non-retryable error after all retries
- **THEN** `this.events.emit({ type: "turn:error", error, attempt, maxRetries })` SHALL be called

#### Scenario: turn:abort emitted with reason

- **WHEN** `harness.abort()` is called due to user pressing Esc or clicking abort
- **THEN** `this.events.emit({ type: "turn:abort", reason: "user" })` SHALL be called
- **WHEN** `harness.abort()` is called during shutdown or session switch
- **THEN** `this.events.emit({ type: "turn:abort", reason: "system" })` SHALL be called

### Requirement: Harness emits config and MCP events directly

Config changes (via `ConfigWatch.onChange`) SHALL emit `config:change`. MCP state changes SHALL emit `mcp:state`. MCP initialization SHALL call `this.events.emit({ type: "mcp:state", servers })` instead of `this.ui.pushMcpState()`.

#### Scenario: Config change emits config:change

- **WHEN** ConfigWatch fires the onChange callback
- **THEN** Harness SHALL call `this.events.emit({ type: "config:change", data })` instead of `this.ui.onConfigChange()`

#### Scenario: MCP state pushed via event

- **WHEN** MCP initialization completes
- **THEN** Harness SHALL call `this.events.emit({ type: "mcp:state", servers })` instead of `this.ui.pushMcpState()`
- **THEN** `this.imagePipeline` is instantiated with the vision config from `config.vision`, the cache directory, and an `onWarning` callback

#### Scenario: ImagePipeline accessible via HarnessAPI
- **WHEN** a consumer accesses `harness.imagePipeline`
- **THEN** it receives the `ImagePipeline` instance

