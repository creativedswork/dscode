## Purpose

Delta specification for the `settings-panel-ui` capability. Bumps typographic scale for section labels, select elements, and cache display.

## MODIFIED Requirements

### Requirement: Settings panel in sidebar

A "Settings" button SHALL appear in the sidebar footer area. Clicking it SHALL open a resizable detail panel (default 320px, range 240-480px) with Appearance, Model, Vision, and Cache sections.

#### Scenario: Settings panel opens
- **WHEN** the user clicks the Settings button in the sidebar footer
- **THEN** a resizable detail panel SHALL open showing settings sections
- **AND** the Settings button SHALL become visually active

### Requirement: Appearance settings

The Settings panel SHALL include an Appearance section with theme information.

#### Scenario: Theme display
- **WHEN** the Appearance section renders
- **THEN** a section label SHALL show "Appearance" at 11px, weight 600, uppercase, letter-spacing 0.08em
- **AND** the theme info SHALL display at 12px in a settings card

### Requirement: Model settings

The Settings panel SHALL include a Model section with Provider, Model, and Thinking Level selectors.

#### Scenario: Provider and model selection
- **WHEN** the Model section renders
- **THEN** section label SHALL be 11px weight 600 uppercase
- **AND** select dropdowns SHALL use 12px font size with 8px 12px padding
- **AND** labels above selects SHALL be 12px muted

### Requirement: Cache settings

The Settings panel SHALL include a Cache section showing cache usage and a "Clear All Cache" button.

#### Scenario: Cache display
- **WHEN** the Cache section renders
- **THEN** the cache size stat SHALL render at 16px weight 700 in Geist Mono
- **AND** the detail line (files · sessions) SHALL render at 11px muted
