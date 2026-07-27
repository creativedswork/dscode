# kimi-k3-support Specification

## Purpose
TBD - created by archiving change upgrade-pi-packages-kimi-k3. Update Purpose after archive.
## Requirements
### Requirement: kimi-k3 is available as a built-in model
After upgrading pi-ai to 0.80.10, the `kimi-coding` provider SHALL include `k3` in its model list, resolvable via `resolveModel("kimi-coding", "k3")` without any custom provider registration.

#### Scenario: k3 model is resolved
- **WHEN** `resolveModel("kimi-coding", "k3")` is called after the upgrade
- **THEN** the returned model has `api: "anthropic-messages"`, `baseUrl: "https://api.kimi.com/coding"`, `reasoning: true`, `contextWindow: 1048576`, and `maxTokens: 131072`

#### Scenario: k3 appears in model listing
- **WHEN** `getAllModels("kimi-coding")` is called
- **THEN** the result includes `{ id: "k3", name: "Kimi K3" }`

### Requirement: kimi-k3 authenticates via KIMI_API_KEY
The `kimi-coding` provider's auth resolver SHALL use the `KIMI_API_KEY` environment variable, consistent with the existing `API_KEY_ENV_VARS` entry.

#### Scenario: auth resolves from env var
- **WHEN** `getEnvApiKey("kimi-coding")` is called and `KIMI_API_KEY` is set
- **THEN** the key is returned from the environment

#### Scenario: provider listed in API_KEY_ENV_VARS
- **WHEN** the `API_KEY_ENV_VARS` map is inspected
- **THEN** `"kimi-coding": "KIMI_API_KEY"` is present

### Requirement: kimi-k3 supports image input
The k3 model SHALL accept image content in its input, meaning it appears in vision model listings.

#### Scenario: k3 appears in vision models
- **WHEN** `getVisionModels("kimi-coding")` is called
- **THEN** `k3` is included in the result

### Requirement: kimi-k3 thinking level maps to "max" for max-only reasoning
The `getThinkingLevel` function SHALL return `"max"` for k3 (which has `reasoning: true` with `thinkingLevelMap` where only `"max"` is non-null), because pi-ai's `mapThinkingLevelToEffort` passes the level directly through to the API for adaptive-thinking models.

#### Scenario: k3 gets "max" thinking level
- **WHEN** `getThinkingLevel("kimi-coding", "k3")` is called
- **THEN** the system returns `"max"`

#### Scenario: kimi-k2-thinking gets "high" thinking level
- **WHEN** `getThinkingLevel("kimi-coding", "kimi-k2-thinking")` is called
- **THEN** the system returns `"high"` (reasoning model with standard level support)

