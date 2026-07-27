## Purpose

Defines the UI for browsing, managing, and discovering skills within the editorial workshop sidebar.

## ADDED Requirements

### Requirement: Skills panel in sidebar

The sidebar SHALL include a "Skills" navigation item with a count badge. Clicking it SHALL open a 280px detail panel showing installed skills, available skills, and a marketplace entry point.

#### Scenario: Skills nav item
- **WHEN** the sidebar renders
- **THEN** a "Skills" nav item SHALL appear with a star icon and a count badge showing the number of installed skills

#### Scenario: Skills panel opens
- **WHEN** the user clicks "Skills" in the sidebar
- **THEN** a 280px panel SHALL open showing Installed and Available skill sections

### Requirement: Installed skills section

The Skills panel SHALL display installed skills as cards with icon, name, description, tags, and an "Active" status indicator.

#### Scenario: Installed skill card
- **WHEN** the Skills panel renders the Installed section
- **THEN** each installed skill SHALL show: a green-background icon area with an emoji or letter, the skill name (bold, 12px), a short description (11px, muted), and action tags
- **AND** an "Active" button SHALL indicate the skill is currently loaded

### Requirement: Available skills section

The Skills panel SHALL display available (not installed) skills with an "Install" button.

#### Scenario: Available skill card
- **WHEN** the Skills panel renders the Available section
- **THEN** each available skill SHALL show: a purple-background icon area, skill name, description, and tags
- **AND** an "Install" button SHALL be rendered with accent background and white text
- **AND** the card background SHALL change on hover

### Requirement: Skill marketplace entry point

The Skills panel footer SHALL contain a dashed-border banner with a marketplace icon, title ("Skill Marketplace"), description, and a "Browse Marketplace" button.

#### Scenario: Marketplace banner
- **WHEN** the Skills panel renders
- **THEN** a marketplace banner SHALL appear at the bottom of the panel
- **AND** the banner SHALL have a dashed border, puzzle piece icon, title, description, and "Browse Marketplace" button
- **AND** the "Browse Marketplace" button SHALL be an outline button with accent border and text
