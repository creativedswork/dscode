## ADDED Requirements

### Requirement: Vision model configuration is persisted in user config
The system SHALL store an optional `vision` object in `~/.dscode/config.json` with `provider` and `model` as required fields and `key` as an optional field. The `vision` object itself is optional — if absent, no vision model is configured.

#### Scenario: Save vision provider and model
- **WHEN** the user runs `/config vision-provider qwen` followed by `/config vision-model qwen3.6-plus`
- **THEN** `~/.dscode/config.json` contains `"vision": { "provider": "qwen", "model": "qwen3.6-plus" }`

#### Scenario: Save vision API key
- **WHEN** the user runs `/config vision-key sk-xxxx`
- **THEN** `~/.dscode/config.json` contains `"vision": { ..., "key": "sk-xxxx" }`

#### Scenario: Load config with vision model configured
- **WHEN** `loadConfig()` is called and `config.json` contains a `vision` object with `provider` and `model`
- **THEN** the returned `HarnessConfig` has `config.vision` populated with those values

#### Scenario: Load config without vision model
- **WHEN** `loadConfig()` is called and `config.json` has no `vision` key
- **THEN** the returned `HarnessConfig` has `config.vision` as `undefined`

### Requirement: Vision model is used when images are present and configured
When a user prompt includes images AND a vision model is configured, the system SHALL use the vision model to describe the images and inject the description into the prompt before sending to the main model. The main model's state (`agent.state.model`) MUST NOT be modified.

#### Scenario: Vision model routes image request
- **WHEN** the user sends a prompt with images and `visionProvider` / `visionModelId` are configured
- **THEN** the system calls the vision model with a prompt to describe the images
- **AND** the vision model's text response is wrapped in `<image_description>` tags and prepended to the user's prompt
- **AND** the enriched prompt is sent to the main model as a text-only message

#### Scenario: Vision model not called when no images
- **WHEN** the user sends a text-only prompt and `visionProvider` / `visionModelId` are configured
- **THEN** the vision model is NOT called
- **AND** the prompt goes directly to the main model

#### Scenario: Main model handles images natively when vision model not configured
- **WHEN** the user sends a prompt with images and `visionProvider` is NOT configured
- **AND** the main model's `input` array includes `"image"`
- **THEN** images are passed directly to the main model via `agent.prompt(text, images)`

### Requirement: Vision model failure falls back to OCR
If the vision model is configured but cannot process the images (API key missing, model not found, API call fails), the system SHALL fall back to the existing OCR pipeline.

#### Scenario: Vision model API key missing
- **WHEN** the user sends a prompt with images, `vision.provider` is configured
- **AND** neither `vision.key` is set in config nor the environment variable for the vision provider is set
- **THEN** the system prints a warning and falls back to OCR

#### Scenario: Vision model resolveModel fails
- **WHEN** the user sends a prompt with images, `vision.provider` / `vision.model` are configured
- **AND** `resolveModel(vision.provider, vision.model)` throws an error
- **THEN** the system prints a warning and falls back to OCR

#### Scenario: Vision model API call fails
- **WHEN** the user sends a prompt with images, vision model is configured and resolved
- **AND** the vision model API call returns an error
- **THEN** the system prints a warning and falls back to OCR

### Requirement: OCR fallback when no vision model and main model lacks image support
When images are present, no vision model is configured, and the main model does not support image input, the system SHALL use the existing Tesseract OCR pipeline to extract text from images.

#### Scenario: DeepSeek main model with images and no vision model
- **WHEN** the user sends a prompt with images, main provider is `deepseek`
- **AND** `vision` is NOT configured
- **THEN** the system runs OCR on the images and injects extracted text into the prompt

### Requirement: /config slash command supports vision model configuration
The `/config` slash command SHALL support `vision-provider`, `vision-model`, and `vision-key` subcommands with the same UX as `provider`, `model`, and `key`.

#### Scenario: List available providers for vision model
- **WHEN** the user runs `/config vision-provider` without arguments
- **THEN** the system lists all available providers with the currently configured vision provider marked

#### Scenario: Set vision provider
- **WHEN** the user runs `/config vision-provider qwen`
- **THEN** the system saves `vision.provider` to `config.json`
- **AND** clears any previously configured `vision.model` (since models are provider-specific)

#### Scenario: List models for current vision provider
- **WHEN** the user runs `/config vision-model` without arguments and a vision provider is configured
- **THEN** the system lists all available models for the current vision provider

#### Scenario: Set vision model
- **WHEN** the user runs `/config vision-model qwen3.6-plus`
- **THEN** the system saves `vision.model` to `config.json`

#### Scenario: Set vision API key
- **WHEN** the user runs `/config vision-key sk-xxxx`
- **THEN** the system saves `vision.key` to `config.json`
- **AND** prints the masked key confirmation

#### Scenario: Default /config output shows vision model status
- **WHEN** the user runs `/config` without arguments
- **THEN** the output includes lines for `visionProvider`, `visionModel`, and `visionKey` showing current values from `config.vision` or "(not set)"
