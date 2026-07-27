# skill-management-ui Specification

## Purpose
TBD - created by archiving change web-ui-editorial-workshop. Update Purpose after archive.
## Requirements
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
- **THEN** each installed skill SHALL show: a green-background icon area (32x32px) with a letter, the skill name at 13px bold, a short description at 11px muted, and action tags at 10px
- **AND** an "Active" button SHALL indicate the skill is currently loaded

### Requirement: Available skills section

The Skills panel SHALL display available (not installed) skills with an "Install" button.

#### Scenario: Available skill card
- **WHEN** the Skills panel renders the Available section
- **THEN** each available skill SHALL show: a purple-background icon area (32x32px), skill name at 13px bold, description at 11px muted, and tags at 10px
- **AND** an "Install" button (11px, weight 600) SHALL be rendered with accent background and white text
- **AND** the card background SHALL change on hover

### Requirement: Skill marketplace entry point

The Skills panel footer SHALL contain a dashed-border banner with a marketplace icon, title ("Skill Marketplace"), description, and a disabled "Browse Marketplace" button with a tooltip.

#### Scenario: Marketplace banner
- **WHEN** the Skills panel renders
- **THEN** a marketplace banner SHALL appear at the bottom of the panel
- **AND** the banner SHALL have a dashed border, puzzle piece icon, title at 13px, description at 11px
- **AND** the "Browse Marketplace" button SHALL be rendered with `disabled` attribute
- **AND** the disabled button SHALL have muted border, reduced opacity (0.5), and `cursor: not-allowed`
- **AND** hovering the disabled button SHALL show a tooltip reading "Coming soon — marketplace integration planned"

