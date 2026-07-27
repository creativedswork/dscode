## Purpose

Provides a centralized model registry for resolving models by provider and ID, with support for both pi-ai built-in and custom providers, plus thinking-level inference from model metadata.
## Requirements
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

### Requirement: provider config maps kimi to KIMI_API_KEY/MOONSHOT_API_KEY
The `PROVIDER_ENV_VARS` map in `config.ts` and the `API_KEY_ENV_VARS` map in `registry.ts` SHALL both include an entry for `"kimi"` mapping to `"KIMI_API_KEY"`.

#### Scenario: kimi is in PROVIDER_ENV_VARS
- **WHEN** `PROVIDER_ENV_VARS["kimi"]` is accessed
- **THEN** the value is `"KIMI_API_KEY"`

#### Scenario: kimi is in API_KEY_ENV_VARS
- **WHEN** `API_KEY_ENV_VARS["kimi"]` is accessed
- **THEN** the value is `"KIMI_API_KEY"`

### Requirement: Thinking level accounts for thinkingLevelMap constraints
The `getThinkingLevel` function SHALL consider the model's `thinkingLevelMap` (if present) when determining the recommended thinking level. If `reasoning: true` and `thinkingLevelMap` has exactly one non-null entry at `"max"`, the function SHALL return `"max"`. If `reasoning: true` and `thinkingLevelMap` has no non-null entries, the function SHALL return `"off"`. In all other cases, the existing `reasoning → "high"`, non-reasoning → `"off"` logic applies.

#### Scenario: Model with only "max" thinking support gets "max"
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: true` and `thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: "max" }`
- **THEN** the system returns `"max"`

#### Scenario: Model with no effective thinking levels gets "off"
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: true` and `thinkingLevelMap` where all entries are `null`
- **THEN** the system returns `"off"`

#### Scenario: Model without thinkingLevelMap uses existing heuristic
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: true` and no `thinkingLevelMap`
- **THEN** the system returns `"high"` (unchanged behavior)

#### Scenario: Non-reasoning model still returns "off"
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: false`
- **THEN** the system returns `"off"` (unchanged behavior)

