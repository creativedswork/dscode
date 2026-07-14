## ADDED Requirements

### Requirement: Model registry resolves models by provider and ID
The system SHALL provide a model registry that can resolve a `Model<Api>` given a provider name and model ID. For providers registered in pi-ai's `Models` instance (both builtin and custom via `setProvider()`), resolution SHALL use `models.getModel()`. For custom providers not yet migrated to pi-ai's provider model, resolution SHALL fall back to provider-specific factories registered via `registerProvider()`.

#### Scenario: Resolve a pi-ai built-in model
- **WHEN** `resolveModel("deepseek", "deepseek-v4-flash")` is called
- **THEN** the system returns the model from `models.getModel("deepseek", "deepseek-v4-flash")`

#### Scenario: Resolve a pi-ai-registered custom provider model
- **WHEN** `resolveModel("qwen", "qwen3.6-plus")` is called and qwen has been registered with pi-ai via `models.setProvider()`
- **THEN** the system returns the model from `models.getModel("qwen", "qwen3.6-plus")` without needing dscode's fallback factories

#### Scenario: Resolve a model from dscode-only registered provider (legacy fallback)
- **WHEN** `resolveModel("legacy-provider", "some-model")` is called and pi-ai's `getModel` returns undefined
- **THEN** the system falls back to `providerFactories` for resolution

### Requirement: Provider model definitions are self-contained
Each supported provider's model definitions SHALL reside in its own file under `src/models/`, exporting its model map, base URL constant, and any provider construction helpers. For providers registered via pi-ai's `createProvider()`, model definitions SHALL be compatible with pi-ai's `Model` type.

#### Scenario: Qwen models are defined in qwen.ts
- **WHEN** a developer opens `src/models/qwen.ts`
- **THEN** they find `QWEN_MODELS`, `DASHSCOPE_BASE`, and optionally a provider construction function defined there, with no references to other providers

#### Scenario: qwen models are pi-ai type-compatible
- **WHEN** model definitions are passed to `createProvider({ models: ... })`
- **THEN** TypeScript compilation succeeds with no type errors

#### Scenario: Adding a new pi-ai-registered provider
- **WHEN** a developer creates `src/models/newprovider.ts` with model definitions and calls `createProvider()` + `models.setProvider()` in `registry.ts`
- **THEN** `resolveModel` and `streamSimple` both work for that provider without additional changes

#### Scenario: Adding a new provider
- **WHEN** a developer creates `src/models/newprovider.ts` with model definitions and registers it in `registry.ts`
- **THEN** `resolveModel` can resolve models from that provider without any changes to `harness.ts`

### Requirement: Thinking level is derived from model metadata
The system SHALL provide a `getThinkingLevel(provider, modelId)` function that returns a recommended thinking level based on model metadata in the registry, falling back to a simple heuristic (reasoning-capable → "high", otherwise "off").

#### Scenario: Reasoning model gets "high" thinking
- **WHEN** `getThinkingLevel("qwen", "qwen3.6-plus")` is called
- **THEN** the system returns `"high"` because the model definition has `reasoning: true`

#### Scenario: Non-reasoning model gets "off" thinking
- **WHEN** `getThinkingLevel("qwen", "qwen-turbo")` is called
- **THEN** the system returns `"off"` because the model definition has `reasoning: false`

#### Scenario: pi-ai model fallback heuristic
- **WHEN** `getThinkingLevel("deepseek", "deepseek-v4-flash")` is called and no explicit recommendation exists in the registry
- **THEN** the system applies the fallback heuristic based on model ID patterns (e.g., "thinking" in name → "high")

### Requirement: Harness uses the model registry module
The `Harness` class SHALL import and use `resolveModel` and `getThinkingLevel` from `src/models/` instead of containing inline model definitions or resolution logic.

#### Scenario: Harness initialization uses resolveModel
- **WHEN** `Harness.initialize()` is called
- **THEN** it calls `resolveModel(config.provider, config.modelId)` from the models module to get the agent's model

#### Scenario: Harness setModel uses resolveModel
- **WHEN** `Harness.setModel("qwen3-coder")` is called
- **THEN** it calls `resolveModel(config.provider, "qwen3-coder")` from the models module

#### Scenario: Harness resolves thinking level from models module
- **WHEN** `Harness.setModel()` determines the thinking level for the new model
- **THEN** it calls `getThinkingLevel(provider, modelId)` from the models module instead of inline heuristics
