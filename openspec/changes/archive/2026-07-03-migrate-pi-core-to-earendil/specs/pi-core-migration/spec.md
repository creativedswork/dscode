## ADDED Requirements

### Requirement: Model registry uses @earendil-works/pi-ai
The system SHALL use `@earendil-works/pi-ai` (v0.80.3+) as the model provider library instead of `@mariozechner/pi-ai`. All model resolution, provider listing, and stream functions SHALL use the `@earendil-works` packages.

#### Scenario: Model resolution works after migration
- **WHEN** `resolveModel("deepseek", "deepseek-v4-pro")` is called
- **THEN** the system returns a valid `Model<Api>` from `@earendil-works/pi-ai`

#### Scenario: Qwen custom provider still works
- **WHEN** `resolveModel("qwen", "qwen3.6-plus")` is called
- **THEN** the system returns the Qwen model from the local provider registry fallback

### Requirement: pi-agent-core uses @earendil-works package
The system SHALL use `@earendil-works/pi-agent-core` (v0.80.3+) instead of `@mariozechner/pi-agent-core`. The `Agent` class and related types (`AgentTool`, `AgentMessage`, `AfterToolCallContext`, etc.) SHALL import from the new package.

#### Scenario: Agent creation after migration
- **WHEN** `Harness.initialize()` creates a new `Agent`
- **THEN** the agent is created successfully using types from `@earendil-works/pi-agent-core`

### Requirement: Stream functions work through Models instance
The system SHALL provide `streamSimple()`, `completeSimple()`, and `complete()` as wrapper functions exported from `src/models/` that delegate to the internal `Models` singleton instance.

#### Scenario: streamSimple via registry
- **WHEN** `streamSimple(model, context, options)` is called via the registry export
- **THEN** it delegates to `models.streamSimple(model, context, options)` and returns a valid event stream

#### Scenario: completeSimple via registry
- **WHEN** `completeSimple(model, context, options)` is called via the registry export
- **THEN** it delegates to `models.completeSimple(model, context, options)` and returns an `AssistantMessage`

#### Scenario: complete via registry
- **WHEN** `complete(model, context, options)` is called via the registry export
- **THEN** it delegates to `models.complete(model, context, options)` and returns an `AssistantMessage`

### Requirement: GLM 5.2 model is available
The system SHALL support GLM 5.2 models through the built-in providers of `@earendil-works/pi-ai`. Users MUST be able to configure and use GLM 5.2 via any pi-ai provider that lists it (e.g., zai, openrouter, opencode-go).

#### Scenario: GLM 5.2 visible in model list
- **WHEN** `getAllModels("zai")` is called
- **THEN** the returned list includes a model entry with `id: "zai/glm-5.2"` or equivalent

#### Scenario: GLM 5.2 model resolution
- **WHEN** `resolveModel("zai", "zai/glm-5.2")` is called
- **THEN** the system returns a valid `Model<Api>` with `name` containing "GLM 5.2"

### Requirement: External API of registry module unchanged
The `src/models/index.ts` module SHALL continue to export `resolveModel`, `getThinkingLevel`, `registerProvider`, `getAllProviders`, `getAllModels`, `getVisionModels`, and `getVisionProviders` with the same signatures and behavior as before the migration.

#### Scenario: resolveModel signature unchanged
- **WHEN** any existing caller invokes `resolveModel(provider, modelId)`
- **THEN** the call compiles and behaves identically to the pre-migration version

#### Scenario: registerProvider still works
- **WHEN** a provider factory is registered via `registerProvider(name, factory, models)`
- **THEN** models from that provider are resolvable through `resolveModel(name, modelId)`
