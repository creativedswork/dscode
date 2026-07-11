## MODIFIED Requirements

### Requirement: Warm design language
All frontend components SHALL use the warm design system tokens defined in the `warm-design-system` spec. Every component MUST reference semantic CSS custom properties for colors and follow the typography and shape language specifications.

#### Scenario: Color token adoption
- **WHEN** any component renders a background, text, border, or accent color
- **THEN** it uses `var(--color-*)` references rather than hardcoded hex values or legacy `dscode-*` Tailwind classes

#### Scenario: Typography adoption
- **WHEN** a component renders text
- **THEN** UI chrome, labels, and body text use Geist Sans; only code blocks, inline code, tool names, and file paths use Geist Mono or JetBrains Mono

#### Scenario: Shape adoption
- **WHEN** a message bubble, card, input, or button renders
- **THEN** it follows the flat component shape guidelines: 12px radius for bubbles, 8px for cards/panels, 6px for buttons, `1px solid` borders as the primary separator, no shadows, no gradients

## ADDED Requirements

### Requirement: Flat message layout for assistant messages
Assistant messages SHALL render using the flat message layout system defined in `flat-message-layout` spec. The existing bubble-based message rendering SHALL be replaced with the `.assistant-msg` flat vertical flow container.

#### Scenario: Assistant message uses flat layout
- **WHEN** an assistant message renders with role `assistant`
- **THEN** it SHALL use the `.assistant-msg` container structure as defined in `flat-message-layout`
- **AND** SHALL NOT use the legacy `.message-card` bubble wrapper

#### Scenario: User message keeps bubble style
- **WHEN** a user message renders with role `user`
- **THEN** it SHALL retain the existing bubble style with `data-collider="message-card"`
- **AND** the bubble SHALL have `border-radius: 16px 16px 4px 16px` and `background: var(--color-user-bubble)`

### Requirement: Thinking block uses div instead of details
The `ThinkingBlock` component SHALL render as a `<div class="thinking">` with a CSS left border rather than a `<details>` element. The thinking content SHALL be always visible.

#### Scenario: Thinking renders as div
- **WHEN** the model sends `thinking_delta` events
- **THEN** the thinking content SHALL render in a `<div class="thinking">` with `border-left: 2px solid var(--border)`
- **AND** SHALL NOT use `<details>` or `<summary>` elements

#### Scenario: Thinking label with dot indicator
- **WHEN** thinking content renders
- **THEN** a label row with "Thinking" uppercase text and a 5px amber dot SHALL appear above the content
