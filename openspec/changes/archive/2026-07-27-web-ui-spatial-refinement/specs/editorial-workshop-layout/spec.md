## Purpose

Delta specification for the `editorial-workshop-layout` capability. Adjusts typographic scale and detail panel dimensions.

## MODIFIED Requirements

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

### Requirement: Serif typography in panel chrome

Panel header titles and session item names SHALL use the serif display font stack.

#### Scenario: Serif in panels
- **WHEN** a detail panel header renders
- **THEN** the panel title SHALL use `font-family: var(--font-display)` at 15px, weight 500
- **AND** session item names in the Sessions panel SHALL use `font-family: var(--font-display)` at 14px


## ADDED Requirements

### Requirement: Phase label typography

Phase labels (Thinking, Executing, Response) SHALL render at 11px font size, weight 600, uppercase, letter-spacing 0.06em.

#### Scenario: Phase label size
- **WHEN** a phase label renders above a message group
- **THEN** the label text SHALL be 11px with color `var(--color-text-muted)`
- **AND** the phase dot SHALL be 6px diameter as an outline circle
