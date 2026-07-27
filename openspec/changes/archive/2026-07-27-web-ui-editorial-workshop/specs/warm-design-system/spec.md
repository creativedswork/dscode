## Purpose

Delta specification for the warm-design-system capability. These requirements MODIFY the existing design tokens defined in `openspec/specs/warm-design-system/`.

## ADDED Requirements

### Requirement: Accent color token update

**Replaces**: The `--color-accent` token value in the existing warm design system.

The primary accent color token SHALL change from `#ca8a04` to `#b87503`. All dependent tokens (accent-hover, accent-bg, user-bubble) SHALL be updated to use the new base hue.

#### Scenario: CSS custom property values
- **WHEN** the `:root` styles are applied
- **THEN** `--color-accent` SHALL be `#b87503`
- **AND** `--color-accent-hover` SHALL be `#946002`
- **AND** `--color-accent-bg` SHALL be `rgba(184, 117, 3, 0.12)`
- **AND** `--color-accent-glow` SHALL be `rgba(184, 117, 3, 0.18)`
- **AND** `--color-user-bubble` SHALL be `#b87503`

#### Scenario: Dark mode accent
- **WHEN** the `.dark` class is active
- **THEN** `--color-accent` SHALL shift to a lighter copper tone approximately `#c98605`
- **AND** `--color-user-bubble-text` SHALL remain `#1e1c19`

### Requirement: New spacing scale

The design system SHALL define a spacing scale with named tokens: `--space-xs` (4px), `--space-sm` (8px), `--space-md` (16px), `--space-lg` (24px), `--space-xl` (40px), `--space-2xl` (64px).

#### Scenario: Spacing tokens available
- **WHEN** any component references spacing
- **THEN** it SHALL use `var(--space-*)` tokens rather than hardcoded pixel values

### Requirement: Updated radius scale

The design system SHALL define a radius scale: `--radius-sm` (6px, buttons), `--radius-md` (10px, cards/panels), `--radius-lg` (16px, bubbles), `--radius-xl` (20px, input containers).

#### Scenario: Radius tokens available
- **WHEN** any component sets border-radius
- **THEN** it SHALL use `var(--radius-*)` tokens

### Requirement: Topbar height standardization

The design system SHALL standardize the topbar height to 38px via a `--topbar-h` token.

#### Scenario: Topbar height
- **WHEN** the topbar renders
- **THEN** it SHALL have `height: var(--topbar-h)` where `--topbar-h` is `38px`
