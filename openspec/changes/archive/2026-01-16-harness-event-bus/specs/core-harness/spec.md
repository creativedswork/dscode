## ADDED Requirements

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

#### Scenario: turn:abort emitted with reason

- **WHEN** `harness.abort()` is called due to user pressing Esc or clicking abort
- **THEN** `this.events.emit({ type: "turn:abort", reason: "user" })` SHALL be called
- **WHEN** `harness.abort()` is called during shutdown or session switch
- **THEN** `this.events.emit({ type: "turn:abort", reason: "system" })` SHALL be called
- **THEN** `this.events.emit({ type: "turn:error", error, attempt, maxRetries })` SHALL be called

### Requirement: Harness emits config and MCP events directly

Config changes (via `ConfigWatch.onChange`) SHALL emit `config:change`. MCP state changes SHALL emit `mcp:state`. MCP initialization SHALL call `this.events.emit({ type: "mcp:state", servers })` instead of `this.ui.pushMcpState()`.

#### Scenario: Config change emits config:change

- **WHEN** ConfigWatch fires the onChange callback
- **THEN** Harness SHALL call `this.events.emit({ type: "config:change", data })` instead of `this.ui.onConfigChange()`

#### Scenario: MCP state pushed via event

- **WHEN** MCP initialization completes
- **THEN** Harness SHALL call `this.events.emit({ type: "mcp:state", servers })` instead of `this.ui.pushMcpState()`

## MODIFIED Requirements

### Requirement: MCP reload uses configStore

The `updateProjectPath()` method SHALL, after reloading MCP servers, emit `mcp:state` via `this.events.emit(...)` instead of calling `this.ui.setMcpManager()` and `this.ui.pushMcpState?.()`. The MCP manager reference SHALL still be directly accessible via `this.mcpManager`.

#### Scenario: MCP reload uses event bus

- **WHEN** `updateProjectPath` reloads MCP servers for a new project
- **THEN** it SHALL call `this.configStore.setMcpServers(mcpServers)` (or `setMcpServers([])` when no servers)
- **AND** SHALL emit `this.events.emit({ type: "mcp:state", servers })` to notify consumers
- **AND** SHALL re-initialize `this.toolRegistry` via `initialize()` and update `this.agent.state.tools` via `buildToolsForRequest()`
- **AND** SHALL NOT call `this.ui.setMcpManager()` or `this.ui.pushMcpState?.()`

### Requirement: Harness registers onChange with event bus

The `Harness.run()` method SHALL register a ConfigWatch onChange listener that emits a `config:change` event instead of calling `this.ui.onConfigChange?.()`.

#### Scenario: onChange registration emits event

- **WHEN** `harness.run()` is called
- **THEN** `this.configStore.onChange(() => this.events.emit({ type: "config:change", data: this.buildConfigData() }))` is registered

#### Scenario: Config mutation triggers config:change event

- **WHEN** any ConfigWatch setter is invoked
- **THEN** `this.events.emit({ type: "config:change", data })` is called, notifying all subscribers
