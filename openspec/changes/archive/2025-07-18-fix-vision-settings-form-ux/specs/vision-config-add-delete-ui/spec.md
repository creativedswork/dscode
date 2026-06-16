## MODIFIED Requirements

### Requirement: Vision config add/delete flow
The Web UI Settings panel SHALL conditionally render the vision model configuration section based on whether `config.vision` is set. When `config.vision` is `undefined` or `null`, the panel SHALL display an "Add Vision Model" button. When `config.vision` is set, the panel SHALL display the full vision configuration form with a "Delete" action. The form fields (provider, model, key) SHALL be rendered whenever `config.vision` is set OR `showVisionForm` is active, and SHALL be driven by `config.vision` values when available.

#### Scenario: Vision not configured shows add button
- **WHEN** the Settings panel renders and `config.vision` is `undefined` or `null`
- **THEN** the panel displays no vision configuration form fields; instead it displays an "Add Vision Model" button below the main model settings

#### Scenario: Click add button reveals configuration form
- **WHEN** the user clicks the "Add Vision Model" button and `config.vision` is still `undefined` or `null`
- **THEN** the full vision configuration form appears (provider dropdown, model dropdown, key input) and the add button is hidden; the form fields are initialized empty; a "Cancel" button is shown to dismiss the form

#### Scenario: Vision configured shows full form with delete
- **WHEN** the Settings panel renders and `config.vision` is set to `{ provider, model, key? }`
- **THEN** the panel SHALL display the vision configuration form with provider, model, and key fields showing current values; a "Delete" button is shown; the form fields are editable and changes are sent immediately on selection/entry

#### Scenario: Delete clears vision config entirely
- **WHEN** the user clicks the "Delete" button in the vision config section
- **THEN** a `set_vision_delete` config command is sent to the server; the vision config is removed; and the UI returns to showing the "Add Vision Model" button

#### Scenario: Config push transitions from add mode to configured mode without hiding form fields
- **WHEN** the user has the Add Vision Model form open (`showVisionForm` is true) AND the server pushes a ConfigData update where `config.vision` becomes non-null (e.g. after selecting a provider)
- **THEN** the form fields remain visible and now display the values from `config.vision`; the "Cancel" button is hidden; a "Delete" button appears; the user can continue editing remaining fields
