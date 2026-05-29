## MODIFIED Requirements

### Requirement: Configuration panel
The frontend SHALL provide a settings panel with flat warm-toned form controls and consistent spacing. The vision model configuration section SHALL be conditionally rendered: hidden with an "Add Vision Model" button when no vision model is configured, fully visible with a "Delete" action when configured.

#### Scenario: Settings panel styling
- **WHEN** the settings panel is rendered
- **THEN** form inputs and selects use `border-radius: 8px`, `border: 1px solid var(--color-border)`, warm surface background, and amber accent on focus — no shadows, no gradients

#### Scenario: Model switching
- **WHEN** user selects a different model from the dropdown
- **THEN** a `config` command is sent with the new model ID

#### Scenario: Thinking level adjustment
- **WHEN** user selects a thinking level
- **THEN** a `config` command is sent with the new thinking level

#### Scenario: API key management
- **WHEN** user enters and saves a new API key
- **THEN** a `config` command is sent and the key is stored

#### Scenario: Vision model not configured
- **WHEN** `config.vision` is `undefined` or `null`
- **THEN** the settings panel does NOT display vision provider, model, or key form fields; instead an "Add Vision Model" button is shown below the main model settings section

#### Scenario: Vision model add button
- **WHEN** the user clicks the "Add Vision Model" button
- **THEN** a local form for vision provider, model, and key is displayed inline; the add button is hidden

#### Scenario: Vision model configured
- **WHEN** `config.vision` is set to `{ provider, model, key? }`
- **THEN** the settings panel displays the vision provider dropdown, model dropdown, and key input with current values, plus a "Delete" button below the key input styled in error color

#### Scenario: Vision model delete
- **WHEN** the user clicks the "Delete" button in the vision config section
- **THEN** a `set_vision_delete` config command is sent; on receiving the updated config, the UI returns to the "Add Vision Model" button state
