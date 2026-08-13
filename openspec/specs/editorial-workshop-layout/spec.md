# editorial-workshop-layout Specification

## Purpose
TBD - created by archiving change web-ui-editorial-workshop. Update Purpose after archive.
## Requirements
### Requirement: Slim topbar with mode switcher

The topbar SHALL be 38px tall and contain: brand (DSCode + dot), session name, a Chat↔Dashboard pill mode switcher, a compact Context Window bar, and a connection status chip.

#### Scenario: Topbar structure
- **WHEN** the app renders
- **THEN** the topbar SHALL be 38px tall with `background: var(--bg-alt)` and `border-bottom: 1px solid var(--border)`
- **AND** the left section SHALL contain the DSCode brand mark and current session name
- **AND** the center section SHALL contain the mode switcher and Context Window bar
- **AND** the right section SHALL contain the connection status chip

#### Scenario: Mode switcher hidden on empty session
- **WHEN** the current session has zero messages
- **THEN** the Chat↔Dashboard pill switcher SHALL be hidden (`display: none`)
- **AND** it SHALL appear (`display: flex`) when messages are present

#### Scenario: Mode switcher toggles Chat/Dashboard
- **WHEN** the user clicks "Dashboard" in the mode switcher
- **THEN** the transition overlay SHALL display for ~1 second
- **AND** the Chat view SHALL be replaced by the Dashboard view
- **AND** the topbar session name SHALL change to "dashboard · <name>"
- **AND** the "Dashboard" button SHALL become active (accent background)

### Requirement: Sidebar split into Create / Capabilities / Settings

The sidebar SHALL be 220px wide and contain: a "Create" section label with a Sessions navigation item (with count badge), a "Capabilities" section label with MCP and Skills navigation items (each with count badge), and a Settings button in the footer area. Sections SHALL be visually separated by a 1px border. Clicking Sessions, MCP, Skills, or Settings SHALL open a resizable detail panel (default 320px, range 240-480px) between the sidebar and main content.

#### Scenario: Sidebar navigation
- **WHEN** the app renders
- **THEN** the sidebar SHALL display "Create" as a section label at 11px font size, weight 600, uppercase, letter-spacing 0.06em
- **AND** SHALL display "Capabilities" as a section label at the same style
- **AND** SHALL display Sessions, MCP, and Skills as navigation items with 15px SVG icons and count badges
- **AND** the active nav item SHALL be highlighted with `--surface` background and `--text` color (not accent)
- **AND** a Settings button SHALL appear in the sidebar footer area with a 15px gear icon

#### Scenario: Panel opens on click
- **WHEN** the user clicks a sidebar nav item (e.g., "MCP")
- **THEN** a resizable detail panel SHALL open between the sidebar and main content
- **AND** the panel SHALL default to 320px width with a drag handle on its right edge
- **AND** the clicked nav item SHALL become active (`--surface` background + `--text` color)
- **AND** any previously open panel SHALL close

#### Scenario: Panel closes on re-click
- **WHEN** the user clicks the currently active sidebar nav item
- **THEN** the detail panel SHALL close
- **AND** the nav item SHALL return to inactive state

### Requirement: Editorial empty state

When no messages exist, the main content area SHALL display an editorial welcome layout: a diamond brand mark (rotated square in accent color on accent-soft circular background), a large title ("What would you like to **create** today?"), a subtitle describing dscode, and capability pills.

#### Scenario: Empty state display
- **WHEN** the message list is empty and no processing is active
- **THEN** the main content SHALL show the editorial empty state centered in the viewport
- **AND** the title SHALL be 28px, font-weight 300, with the word "create" in weight 600
- **AND** capability pills SHALL show: Write code, Refactor systems, Design interfaces, Analyze data, Run commands

### Requirement: Phase-labeled message groups

Assistant message turns SHALL be grouped under phase labels (Thinking, Executing, Response) with animated status dots.

#### Scenario: Thinking phase
- **WHEN** the assistant is generating thinking content
- **THEN** a "Thinking" phase label with a pulsing dot SHALL appear above the thinking block

#### Scenario: Executing phase
- **WHEN** tool calls are in progress
- **THEN** an "Executing" phase label with a pulsing dot SHALL appear above the tool cards
- **AND** when all tool calls complete, the dot SHALL become static (dimmed)

#### Scenario: Response phase
- **WHEN** the assistant is streaming text results
- **THEN** a "Response" phase label with a static dot SHALL appear above the result block

#### Scenario: Phase labels skip for simple responses
- **WHEN** the assistant responds without thinking or tool calls

#### Scenario: Phase dots use outline style
- **WHEN** a phase label renders
- **THEN** the phase dot SHALL be an outline circle (`border: 1px solid var(--text-muted)`, transparent background)
- **AND** when active, the dot SHALL fill with `--text-secondary` and pulse
- **AND** when done, the dot SHALL dim to opacity 0.3
- **AND** the dot SHALL NOT use `--accent` color
- **THEN** only the "Response" phase label SHALL appear (no Thinking or Executing labels)

### Requirement: Dashboard contextual input

When in Dashboard mode, an input area SHALL be present with contextual placeholder text and hint.

#### Scenario: Dashboard input
- **WHEN** the view mode is Dashboard
- **THEN** an input container SHALL render with placeholder "Ask about this dashboard…"
- **AND** a hint text SHALL display "Dashboard mode — ask follow-up questions about this session"
- **AND** a "← Back to Chat" button SHALL be in the dashboard header

### Requirement: Transition overlay

Switching from Chat to Dashboard SHALL display a full-viewport overlay with a particle animation and label text for approximately 1 second before showing the Dashboard view. This represents the existing cascade TransitionCanvas animation in a simplified form for the prototype.

#### Scenario: Transition overlay
- **WHEN** the user triggers Dashboard mode from Chat mode
- **THEN** a semi-transparent overlay SHALL cover the main content area
- **AND** SHALL display the text "Transforming conversation into dashboard…"
- **AND** after ~1 second, SHALL dismiss and show the Dashboard view

### Requirement: Brand diamond mark in topbar

The brand identifier in the topbar SHALL be an 8px rotated square (diamond) in accent color, replacing the previous circle.

#### Scenario: Brand diamond
- **WHEN** the topbar renders
- **THEN** the brand mark SHALL be an 8px square with `border-radius: 1.5px` and `transform: rotate(45deg)`
- **AND** SHALL use `background: var(--accent)`
- **AND** SHALL visually echo the empty state diamond brand mark

### Requirement: Accent color discipline

The copper-gold accent (`--accent: #b87503`) SHALL appear on at most 2 prominent elements per screen: the brand diamond mark and send button. User message bubbles SHALL use a neutral surface, and all other interactive chrome SHALL use `--text-secondary` or `--text-muted`.

#### Scenario: Accent usage constraint
- **WHEN** the app renders in any state
- **THEN** nav active states SHALL use `--text` color (not accent)
- **AND** user message bubbles SHALL use the neutral user-bubble tokens (not accent)
- **AND** phase dots SHALL use `--text-muted` / `--text-secondary` (not accent)
- **AND** tool names in cards SHALL use `--text-secondary` (not accent)
- **AND** settings toggles SHALL use `--text-muted` accent-color (not accent)
- **AND** marketplace buttons SHALL use `--border-strong` borders (not accent)

### Requirement: Serif typography in panel chrome

Panel header titles and session item names SHALL use the serif display font stack.

#### Scenario: Serif in panels
- **WHEN** a detail panel header renders
- **THEN** the panel title SHALL use `font-family: var(--font-display)` at 15px, weight 500
- **AND** session item names in the Sessions panel SHALL use `font-family: var(--font-display)` at 14px

### Requirement: Phase label typography

Phase labels (Thinking, Executing, Response) SHALL render at 11px font size, weight 600, uppercase, letter-spacing 0.06em.

#### Scenario: Phase label size
- **WHEN** a phase label renders above a message group
- **THEN** the label text SHALL be 11px with color `var(--color-text-muted)`
- **AND** the phase dot SHALL be 6px diameter as an outline circle
