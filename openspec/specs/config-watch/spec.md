## ADDED Requirements

### Requirement: ConfigWatch observable config layer
The system SHALL provide a `ConfigWatch` class that wraps `HarnessConfig` with explicit setter methods and a subscription-based change notification mechanism. All configuration mutations SHALL go through ConfigWatch methods rather than direct property assignment on the raw config object.

#### Scenario: ConfigWatch creation
- **WHEN** a `ConfigWatch` is instantiated with a `HarnessConfig` object
- **THEN** it holds a reference to the config object; `get()` returns a `Readonly<HarnessConfig>` snapshot

#### Scenario: onChange subscription
- **WHEN** a listener is registered via `onChange(fn)`
- **THEN** the listener is called with the config object every time any setter method is invoked; the returned unsubscribe function removes the listener

#### Scenario: setModelConfig
- **WHEN** `setModelConfig(provider, modelId, thinkingLevel)` is called
- **THEN** `config.provider`, `config.modelId`, and `config.thinkingLevel` are updated atomically and all onChange listeners are notified

#### Scenario: setApiKey
- **WHEN** `setApiKey(key)` is called
- **THEN** `config.apiKey` is updated and all onChange listeners are notified

#### Scenario: setProjectPath
- **WHEN** `setProjectPath(path)` is called
- **THEN** `config.projectPath` is updated and all onChange listeners are notified

#### Scenario: setVision
- **WHEN** `setVision(vision)` is called
- **THEN** `config.vision` is replaced with the provided `VisionConfig` or set to `undefined`, and all onChange listeners are notified

#### Scenario: updateVision partial update
- **WHEN** `updateVision(patch)` is called with a partial VisionConfig
- **THEN** existing vision fields are preserved, only the provided fields are updated, and all onChange listeners are notified

#### Scenario: setMcpServers
- **WHEN** `setMcpServers(servers)` is called
- **THEN** `config.mcp` is replaced with the provided array and all onChange listeners are notified

### Requirement: Read-only snapshot via get()
The `ConfigWatch.get()` method SHALL return the config as `Readonly<HarnessConfig>` to prevent accidental external mutation.

#### Scenario: get returns readonly type
- **WHEN** external code calls `configStore.get()`
- **THEN** the returned value is typed as `Readonly<HarnessConfig>`, preventing property assignment at compile time

#### Scenario: get returns live reference
- **WHEN** external code reads properties from the returned snapshot
- **THEN** the values reflect the current state of the underlying config (the reference is shared, not cloned)
