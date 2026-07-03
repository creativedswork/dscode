## MODIFIED Requirements

### Requirement: Color token naming convention
The design system SHALL use semantic color tokens (not palette names) so components reference intent rather than specific hues. Every color token MUST have both a light and dark value defined via CSS custom properties.

#### Scenario: Semantic token usage
- **WHEN** a component needs a background color
- **THEN** it references `var(--color-bg)` for the main background, `var(--color-surface)` for elevated surfaces, and `var(--color-accent)` for interactive highlights

#### Scenario: Token completeness
- **WHEN** the design system is fully defined
- **THEN** it includes at minimum: `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-accent-bg`, `--color-success`, `--color-error`, `--color-warning`, `--color-user-bubble`, `--color-user-bubble-text`
