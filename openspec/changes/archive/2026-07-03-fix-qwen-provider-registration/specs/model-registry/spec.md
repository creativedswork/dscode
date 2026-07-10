## MODIFIED Requirements

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

#### Scenario: Unknown model throws error
- **WHEN** `resolveModel("unknown-provider", "no-such-model")` is called
- **THEN** the system throws an error indicating the model could not be found

### Requirement: Provider model definitions are self-contained
Each supported provider's model definitions SHALL reside in its own file under `src/models/`, exporting its model map, base URL constant, and any provider construction helpers. For providers registered via pi-ai's `createProvider()`, model definitions SHALL be compatible with pi-ai's `Model` type.

#### Scenario: Qwen models are defined in qwen.ts
- **WHEN** a developer opens `src/models/qwen.ts`
- **THEN** they find `QWEN_MODELS`, `DASHSCOPE_BASE`, and optionally a provider construction function defined there, with no references to other providers

#### Scenario: qwen models are pi-ai type-compatible
- **WHEN** `Object.values(QWEN_MODELS)` is passed to `createProvider({ models: ... })`
- **THEN** TypeScript compilation succeeds with no type errors

#### Scenario: Adding a new pi-ai-registered provider
- **WHEN** a developer creates `src/models/newprovider.ts` with model definitions and calls `createProvider()` + `models.setProvider()` in `registry.ts`
- **THEN** `resolveModel` and `streamSimple` both work for that provider without additional changes
