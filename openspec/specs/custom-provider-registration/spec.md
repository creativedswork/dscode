## Requirements

### Requirement: Custom provider is registered with pi-ai Models instance
The system SHALL register non-pi-ai-builtin providers with pi-ai's `Models` instance via `createProvider()` + `setProvider()`, such that the provider is available for both model resolution and API streaming calls.

#### Scenario: qwen provider is registered at startup
- **WHEN** the model registry module is initialized
- **THEN** a pi-ai `Provider` for "qwen" is constructed and registered via `models.setProvider()`
- **AND** `models.getProvider("qwen")` returns the registered provider

#### Scenario: qwen models are available through pi-ai
- **WHEN** `models.getModels("qwen")` is called after qwen provider registration
- **THEN** the system returns the full list of qwen models (qwen3.6-plus, qwen3-coder, qwq-32b, qwen-max, qwen-plus, qwen-turbo)

#### Scenario: qwen streaming works end-to-end
- **WHEN** `streamSimple(qwenModel, context, options)` is called with a valid qwen model
- **THEN** pi-ai resolves the "qwen" provider and initiates an OpenAI-compatible streaming request to DashScope
- **AND** no "provider not found" error is raised

### Requirement: Custom provider uses envApiKeyAuth for API key resolution
A custom provider registered via `createProvider()` SHALL use pi-ai's `envApiKeyAuth` for API key resolution, sourcing from the provider-specific environment variable.

#### Scenario: API key resolved from DASHSCOPE_API_KEY
- **WHEN** `models.getAuth(qwenModel)` is called and `DASHSCOPE_API_KEY` is set in the environment
- **THEN** the system resolves the API key from that environment variable

#### Scenario: API key unresolved when env var is missing
- **WHEN** `models.getAuth(qwenModel)` is called and `DASHSCOPE_API_KEY` is not set
- **THEN** the system returns `undefined`, indicating the provider is unconfigured

### Requirement: qwen models specify thinkingFormat for reasoning
Qwen model definitions SHALL include `thinkingFormat: "qwen"` in their `compat` settings so that pi-ai 0.80.3 formats reasoning parameters as `enable_thinking: boolean`.

#### Scenario: qwen3.6-plus has qwen thinking format
- **WHEN** a qwen3.6-plus model definition is inspected
- **THEN** its `compat.thinkingFormat` is `"qwen"`
- **AND** `compat.supportsDeveloperRole` is `false`

#### Scenario: Stream with reasoning-enabled qwen model
- **WHEN** `streamSimple(qwen3.6-plus, context)` is called with a thinking level that enables reasoning
- **THEN** the request to DashScope includes `enable_thinking: true` in the request body
