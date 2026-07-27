## MODIFIED Requirements

### Requirement: Model registry resolves models by provider and ID
The system SHALL provide a model registry that can resolve a `Model<Api>` given a provider name and model ID. For providers registered in pi-ai's `Models` instance (both builtin and custom via `setProvider()`), resolution SHALL use `models.getModel()`. For custom providers not yet migrated to pi-ai's provider model, resolution SHALL fall back to provider-specific factories registered via `registerProvider()`.

#### Scenario: Resolve a pi-ai built-in model
- **WHEN** `resolveModel("deepseek", "deepseek-v4-flash")` is called
- **THEN** the system returns the model from `models.getModel("deepseek", "deepseek-v4-flash")`

#### Scenario: Resolve a pi-ai-registered custom provider model
- **WHEN** `resolveModel("qwen", "qwen3.6-plus")` is called and qwen has been registered with pi-ai via `models.setProvider()`
- **THEN** the system returns the model from `models.getModel("qwen", "qwen3.6-plus")` without needing dscode's fallback factories

#### Scenario: Resolve the custom kimi provider model
- **WHEN** `resolveModel("kimi", "kimi-k3")` is called and kimi has been registered with pi-ai via `models.setProvider()`
- **THEN** the system returns the model from `models.getModel("kimi", "kimi-k3")`

#### Scenario: Resolve a model from dscode-only registered provider (legacy fallback)
- **WHEN** `resolveModel("legacy-provider", "some-model")` is called and pi-ai's `getModel` returns undefined
- **THEN** the system falls back to `providerFactories` for resolution

### Requirement: Thinking level is derived from model metadata
The system SHALL provide a `getThinkingLevel(provider, modelId)` function that returns a recommended thinking level based on model metadata in the registry. If the model has `reasoning: true` with a `thinkingLevelMap` where only `"max"` is non-null, the function SHALL return `"max"`. If `reasoning: true` with all-null `thinkingLevelMap`, it SHALL return `"off"`. Otherwise, reasoning models return `"high"` and non-reasoning models return `"off"`. For unresolved models, a heuristic based on model ID patterns applies.

#### Scenario: Reasoning model gets "high" thinking
- **WHEN** `getThinkingLevel("qwen", "qwen3.6-plus")` is called
- **THEN** the system returns `"high"` because the model definition has `reasoning: true`

#### Scenario: Model with only max thinking support gets max
- **WHEN** `getThinkingLevel("kimi", "kimi-k3")` is called
- **THEN** the system returns `"max"` because `thinkingLevelMap` has only `"max"` non-null

#### Scenario: Non-reasoning model gets "off" thinking
- **WHEN** `getThinkingLevel("qwen", "qwen-turbo")` is called
- **THEN** the system returns `"off"` because the model definition has `reasoning: false`

#### Scenario: pi-ai model fallback heuristic
- **WHEN** `getThinkingLevel("deepseek", "deepseek-v4-flash")` is called and no explicit recommendation exists in the registry
- **THEN** the system applies the fallback heuristic based on model ID patterns (e.g., "thinking" in name → "high")

## ADDED Requirements

### Requirement: provider config maps kimi to KIMI_API_KEY/MOONSHOT_API_KEY
The `PROVIDER_ENV_VARS` map in `config.ts` and the `API_KEY_ENV_VARS` map in `registry.ts` SHALL both include an entry for `"kimi"` mapping to `"KIMI_API_KEY"`.

#### Scenario: kimi is in PROVIDER_ENV_VARS
- **WHEN** `PROVIDER_ENV_VARS["kimi"]` is accessed
- **THEN** the value is `"KIMI_API_KEY"`

#### Scenario: kimi is in API_KEY_ENV_VARS
- **WHEN** `API_KEY_ENV_VARS["kimi"]` is accessed
- **THEN** the value is `"KIMI_API_KEY"`
