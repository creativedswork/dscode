## MODIFIED Requirements

### Requirement: Skills panel in sidebar

The sidebar SHALL include a "Skills" navigation item with a count badge showing the number of **active** skills (derived from the backend `SkillManager`). Clicking it SHALL open a 320px detail panel displaying skills grouped by "Active" and "Inactive", plus a marketplace banner.

#### Scenario: Skills nav item with live count
- **WHEN** the sidebar renders
- **THEN** a "Skills" nav item SHALL appear with a star icon and a count badge showing the current number of active skills from `SkillManager.listAll()`
- **AND** the badge SHALL update when skills are activated or deactivated

#### Scenario: Skills panel opens with live data
- **WHEN** the user clicks "Skills" in the sidebar
- **THEN** a 320px panel SHALL open showing "Active" and "Inactive" skill sections populated from the backend
- **AND** the panel SHALL display a loading state while skill data is being fetched

### Requirement: Active skills section

The Skills panel SHALL display active skills as cards with icon, name, description, source label, tool count, and an "on" toggle switch.

#### Scenario: Active skill card
- **WHEN** the Skills panel renders the Active section
- **THEN** each active skill SHALL show: an accent-colored icon area (32×32px) with an initial letter, the skill name at 13px bold, a short description at 11px muted, a tool count tag with accent styling, a source tag ("user" or "project"), and a toggle switch in the "on" position
- **AND** the card background SHALL change on hover

#### Scenario: Toggle active skill off
- **WHEN** the user clicks the toggle on an active skill card
- **THEN** the backend SHALL deactivate the skill via `SkillManager.deactivate()`
- **AND** the card SHALL move to the Inactive section
- **AND** the sidebar badge count SHALL decrement
- **AND** the toggle SHALL transition to the "off" position

### Requirement: Inactive skills section

The Skills panel SHALL display inactive skills as cards with reduced visual prominence, showing an "off" toggle that can be turned on.

#### Scenario: Inactive skill card
- **WHEN** the Skills panel renders the Inactive section
- **THEN** each inactive skill SHALL show: a muted icon area (32×32px) with an initial letter, the skill name at 13px bold, a muted description at 11px, a muted tool count tag, a source tag, and a toggle switch in the "off" position
- **AND** the card SHALL have reduced opacity (0.65) to visually distinguish it from active skills
- **AND** the card background SHALL change on hover

#### Scenario: Toggle inactive skill on
- **WHEN** the user clicks the toggle on an inactive skill card
- **THEN** the backend SHALL activate the skill via `SkillManager.activate()`
- **AND** the card SHALL move to the Active section
- **AND** the sidebar badge count SHALL increment
- **AND** the toggle SHALL transition to the "on" position

#### Scenario: No inactive skills
- **WHEN** all discovered skills are active
- **THEN** the Inactive section SHALL show an empty state message: "All skills are active"

### Requirement: Skill marketplace entry point

The Skills panel footer SHALL contain a dashed-border banner with a marketplace icon, title ("Skill Marketplace"), description, and a disabled "Browse Marketplace" button with a tooltip. This section is unchanged from the current design.

#### Scenario: Marketplace banner
- **WHEN** the Skills panel renders
- **THEN** a marketplace banner SHALL appear at the bottom of the panel
- **AND** the banner SHALL have a dashed border, puzzle piece icon, title at 13px, description at 11px
- **AND** the "Browse Marketplace" button SHALL be rendered with `disabled` attribute
- **AND** the disabled button SHALL have muted border, reduced opacity (0.5), and `cursor: not-allowed`
- **AND** hovering the disabled button SHALL show a tooltip reading "Coming soon — marketplace integration planned"

## REMOVED Requirements

### Requirement: Installed skills section
**Reason**: Replaced by "Active skills section" which shows live data instead of hardcoded mock data. The concept of "installed" is equivalent to "exists on disk" which is already guaranteed for all discovered skills.
**Migration**: N/A — the existing Installed section was populated by a hardcoded array in `DetailSkillsPanel`. Replace with the Active section driven by `SkillManager.listAll()`.

### Requirement: Available skills section
**Reason**: The "Available" section showed skills not present on disk with a non-functional "Install" button. In the current file-driven skill system, there is no concept of a remote skill marketplace, so "Available but not installed" is meaningless. All skills on disk are already available (either active or inactive).
**Migration**: Remove the "Available" section entirely. The "Inactive" section replaces it for discoverable but not currently active skills. The marketplace banner remains as a placeholder for when remote skill discovery is implemented.
