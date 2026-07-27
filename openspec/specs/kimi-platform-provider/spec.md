# kimi-platform-provider Specification

## Purpose
TBD - created by archiving change add-kimi-platform-provider. Update Purpose after archive.
## Requirements
### Requirement: kimi provider is available as a dscode custom provider
The system SHALL register a `kimi` provider via `createProvider()` + `models.setProvider()` in `registry.ts`, using `https://api.moonshot.cn/v1` as baseUrl with `openai-completions` API. The provider SHALL coexist with pi-ai's built-in `kimi-coding` provider without overriding it.

#### Scenario: kimi provider appears in provider listing
- **WHEN** `getAllProviders()` is called
- **THEN** `"kimi"` is included in the result

#### Scenario: pi-ai's kimi-coding is still available
- **WHEN** `getAllProviders()` is called
- **THEN** `"kimi-coding"` is still included (not overridden by the custom `kimi` provider)

### Requirement: kimi provider authenticates via KIMI_API_KEY or MOONSHOT_API_KEY
The `kimi` provider's auth resolver SHALL first check `KIMI_API_KEY` environment variable, then fall back to `MOONSHOT_API_KEY`.

#### Scenario: auth resolves from KIMI_API_KEY
- **WHEN** `KIMI_API_KEY` is set and `MOONSHOT_API_KEY` is not
- **THEN** the provider uses the value from `KIMI_API_KEY`

#### Scenario: auth resolves from MOONSHOT_API_KEY when KIMI_API_KEY is absent
- **WHEN** `KIMI_API_KEY` is not set but `MOONSHOT_API_KEY` is set
- **THEN** the provider uses the value from `MOONSHOT_API_KEY`

#### Scenario: auth prefers KIMI_API_KEY when both are set
- **WHEN** both `KIMI_API_KEY` and `MOONSHOT_API_KEY` are set
- **THEN** the provider uses the value from `KIMI_API_KEY`

### Requirement: kimi-k3 model is resolvable under kimi provider
The `kimi` provider SHALL include `kimi-k3` as a model, resolvable via `resolveModel("kimi", "kimi-k3")`.

#### Scenario: kimi-k3 model is resolved
- **WHEN** `resolveModel("kimi", "kimi-k3")` is called
- **THEN** the returned model has `api: "openai-completions"`, `baseUrl: "https://api.moonshot.cn/v1"`, `reasoning: true`, `contextWindow: 1048576`, and `maxTokens: 131072`

#### Scenario: kimi-k3 appears in model listing
- **WHEN** `getAllModels("kimi")` is called
- **THEN** the result includes `{ id: "kimi-k3", name: "Kimi K3" }`

### Requirement: kimi-k3 supports image input
The kimi-k3 model SHALL accept image content in its input.

#### Scenario: kimi-k3 appears in vision models
- **WHEN** `getVisionModels("kimi")` is called
- **THEN** `kimi-k3` is included in the result

### Requirement: kimi-k3 thinking level returns max
The `getThinkingLevel` function SHALL return `"max"` for `kimi-k3` under the `kimi` provider (consistent with its `thinkingLevelMap` where only `"max"` is non-null).

#### Scenario: kimi-k3 gets max thinking level
- **WHEN** `getThinkingLevel("kimi", "kimi-k3")` is called
- **THEN** the system returns `"max"`

