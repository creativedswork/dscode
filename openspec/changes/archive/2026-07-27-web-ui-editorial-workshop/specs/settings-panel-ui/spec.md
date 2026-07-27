## Purpose

Defines the Settings panel UI accessible from the editorial workshop sidebar.

## ADDED Requirements

### Requirement: Settings panel in sidebar

A "Settings" button SHALL appear in the sidebar footer area. Clicking it SHALL open a 280px detail panel with Appearance, Model, Vision, and Cache sections.

#### Scenario: Settings panel opens
- **WHEN** the user clicks the Settings button in the sidebar footer
- **THEN** a 280px detail panel SHALL open showing settings sections
- **AND** the Settings button SHALL become visually active

### Requirement: Appearance settings

The Settings panel SHALL include an Appearance section with a Theme selector (Light/Dark).

#### Scenario: Theme selection
- **WHEN** the Appearance section renders
- **THEN** a row SHALL show "Theme" label with a `<select>` dropdown containing Light and Dark options
- **AND** the current theme SHALL be pre-selected

### Requirement: Model settings

The Settings panel SHALL include a Model section with Provider and Model selectors.

#### Scenario: Provider and model selection
- **WHEN** the Model section renders
- **THEN** a "Provider" row SHALL show a dropdown with available providers (deepseek, qwen, kimi)
- **AND** a "Model" row SHALL show a dropdown with models for the selected provider

### Requirement: Vision settings

The Settings panel SHALL include a Vision section with an OCR Model selector and a checkbox for proxying images through the vision model.

#### Scenario: Vision configuration
- **WHEN** the Vision section renders
- **THEN** an "OCR Model" row SHALL show a dropdown (Auto-detect, qwen-vl-max)
- **AND** a checkbox SHALL be present with label "Proxy images through vision model"
- **AND** the checkbox SHALL use accent-color for its checked state

### Requirement: Cache settings

The Settings panel SHALL include a Cache section showing session cache and file cache usage, and a "Clear All Cache" button.

#### Scenario: Cache display
- **WHEN** the Cache section renders
- **THEN** a card SHALL show session cache usage (e.g., "4 sessions · 2.3 MB")
- **AND** SHALL show file cache usage (e.g., "12 files · 8.1 MB")
- **AND** a red-bordered "Clear All Cache" button SHALL be present with red text on red-tinted background
