## ADDED Requirements

### Requirement: Accent background color token
The design system SHALL provide a `--color-accent-bg` CSS custom property, representing a low-opacity tint of the accent color for use as a selected/active background. Both light and dark variants MUST be defined.

#### Scenario: Light mode accent background
- **WHEN** the `:root` stylesheet is active (no `.dark` class on `<html>`)
- **THEN** `--color-accent-bg` resolves to a low-opacity amber tint (≈ `rgba(202, 138, 4, 0.12)`)

#### Scenario: Dark mode accent background
- **WHEN** the `.dark` class is applied to `<html>`
- **THEN** `--color-accent-bg` resolves to a low-opacity amber tint (≈ `rgba(212, 151, 8, 0.15)`)

#### Scenario: Smooth transition on theme toggle
- **WHEN** the theme class is toggled on `<html>`
- **THEN** `--color-accent-bg` transitions smoothly alongside all other color properties over 300ms

### Requirement: Token usage for selected states
Components SHALL use `var(--color-accent-bg)` to indicate a selected, active, or currently-focused item state in lists, sidebars, and navigation.

#### Scenario: Active session row background
- **WHEN** a session item in the sidebar is the currently active session
- **THEN** its background color is `var(--color-accent-bg)`, visually distinguishing it from inactive session rows
