## Purpose

Delta specification for the web-frontend capability. These requirements MODIFY or REPLACE existing requirements in `openspec/specs/web-frontend/spec.md`.

## ADDED Requirements

### Requirement: Warm design language → Editorial workshop design language

**Replaces**: "Warm design language" requirement.

All frontend components SHALL use the editorial workshop design system as defined in the `editorial-workshop-layout` spec. The app shell SHALL use the 38px topbar, 220px sidebar with expandable panels, and phase-labeled message groups.

#### Scenario: Color token adoption
- **WHEN** any component renders a background, text, border, or accent color
- **THEN** it uses `var(--color-*)` references with the updated accent value `#b87503`

#### Scenario: Typography adoption
- **WHEN** a component renders text
- **THEN** UI chrome, labels, and body text use Geist Sans; code blocks and technical identifiers use Geist Mono
- **AND** the empty state title SHALL use serif display font at 28px weight 400, phase labels SHALL be 10px weight 600 uppercase
- **AND** panel titles and session names SHALL use serif display font

#### Scenario: Shape adoption
- **WHEN** a message bubble, card, input, or button renders
- **THEN** it follows the editorial workshop radius scale: 20px for input containers, 16px for bubbles, 10px for cards/panels, 6px for buttons and small elements

### Requirement: Sidebar restructured

**Replaces**: The existing sidebar requirement implicitly defined by the current `Sidebar.tsx` implementation.

The sidebar SHALL NOT contain a "Views" section (Chat/Dashboard). The Dashboard mode SHALL be toggled via a pill switcher in the topbar. The sidebar SHALL be split into **Create** (Sessions) and **Capabilities** (MCP, Skills) sections, plus a Settings footer button.

#### Scenario: Sidebar nav items
- **WHEN** the sidebar renders in the editorial workshop layout
- **THEN** it SHALL display Sessions under a "Create" section label
- **AND** a Settings button SHALL be in the footer area
- **AND** no Chat or Dashboard items SHALL appear

### Requirement: Dashboard mode switcher in topbar

**Replaces**: The existing ViewModeSwitcher `<select>` dropdown.

The Chat↔Dashboard mode toggle SHALL be a pill-style button group in the topbar center, not a `<select>` dropdown. It SHALL only be visible when messages exist. Switching to Dashboard SHALL trigger a transition overlay.

#### Scenario: Mode switcher visible with messages
- **WHEN** the current session has at least one message
- **THEN** the Chat↔Dashboard pill switcher SHALL be visible in the topbar center

#### Scenario: Mode switcher hidden on empty
- **WHEN** the current session has zero messages
- **THEN** the Chat↔Dashboard pill switcher SHALL be hidden

### Requirement: Empty state editorial welcome

**Replaces**: The current empty state (400px card with "DSCode Web" heading and `/help` instructions).

The empty state SHALL be a full-viewport editorial layout: a diamond brand mark, a large title "What would you like to **create** today?", a subtitle, and capability pills.

#### Scenario: Empty state display
- **WHEN** no messages exist and no processing is active
- **THEN** the editorial empty state SHALL be displayed centered in the main content area
- **AND** the mode switcher SHALL be hidden
