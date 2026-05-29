## ADDED Requirements

### Requirement: Vision config add/delete flow
The Web UI Settings panel SHALL conditionally render the vision model configuration section based on whether `config.vision` is set. When `config.vision` is `undefined` or `null`, the panel SHALL display an "Add Vision Model" button. When `config.vision` is set, the panel SHALL display the full vision configuration form with a "Delete" action.

#### Scenario: Vision not configured shows add button
- **WHEN** the Settings panel renders and `config.vision` is `undefined` or `null`
- **THEN** the panel displays no vision configuration form fields; instead it displays an "Add Vision Model" button below the main model settings

#### Scenario: Click add button reveals configuration form
- **WHEN** the user clicks the "Add Vision Model" button
- **THEN** the full vision configuration form appears (provider dropdown, model dropdown, key input) and the add button is hidden; the form fields are initialized empty

#### Scenario: Vision configured shows full form with delete
- **WHEN** the Settings panel renders and `config.vision` is set to `{ provider, model, key? }`
- **THEN** the panel displays the vision configuration form (provider, model, key) with current values, and a "Delete" button is shown below the vision key input

#### Scenario: Delete clears vision config entirely
- **WHEN** the user clicks the "Delete" button in the vision config section
- **THEN** a `set_vision_delete` config command is sent to the server; the vision config is removed; and the UI returns to showing the "Add Vision Model" button

#### Scenario: Config push resets local form state
- **WHEN** the server pushes a ConfigData update where `config.vision` becomes non-null (e.g. after provider selection)
- **THEN** any local `showVisionForm` state is reset, and the UI switches to showing the full configured form driven by `config.vision`
