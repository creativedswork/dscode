## ADDED Requirements

### Requirement: Thinking block active strike during cascade
The `.thinking` block SHALL receive a `data-collider="thinking-block"` attribute, making it a cascade target in the hop-step state machine. When the dscode cluster reaches the thinking block's row, it SHALL execute the full strike sequence (squash → stretch → dwell → hop). The destruction effect SHALL be a quiet dissolution: opacity fade over 300ms, 15–25 particles rising gently from the text region (vy = rand(-3, -1), vx = rand(-1.5, 1.5)), particle size 1–2px, particle life rand(600, 1000)ms, using `--color-accent` for the label dot area and `--color-text-muted` for the body text area. No character scatter, no impact rings, no shards.

#### Scenario: Thinking block included in row list
- **WHEN** `buildRowList()` queries `[data-collider]` elements
- **THEN** the `.thinking` block SHALL appear in the resulting `rows[]` array
- **AND** the cluster SHALL stop and execute squash/stretch at the thinking block's position

#### Scenario: Thinking block struck with quiet dissolution
- **WHEN** the cluster strikes the `.thinking` block row
- **THEN** the thinking block SHALL fade to `opacity: 0` over 300ms
- **AND** 15–25 small particles (1–2px) SHALL emit from the thinking block's text region
- **AND** particles SHALL drift upward slowly (vy = rand(-3, -1)) with slight horizontal drift (vx = rand(-1.5, 1.5))
- **AND** no character scatter animation or clone overlay SHALL be applied
- **AND** no impact rings or shards SHALL spawn

#### Scenario: Thinking block label and body both affected
- **WHEN** the thinking block is struck
- **THEN** both the `.label` and `.thinking-body` children SHALL fade together as the parent `.thinking` div transitions to `opacity: 0`
- **AND** particles SHALL be colored with `--color-accent` near the label dot area and `--color-text-muted` from the body text area

---

### Requirement: Timestamp dissolution on cluster proximity
Message timestamp elements (`.meta` divs displaying "dscode · 09:41" for assistant messages and "You · 09:41" for user messages) SHALL dissolve into particles when the dscode cluster passes within a defined proximity during its hop arc. This dissolution SHALL be purely visual — no collision physics (no squash/stretch), no impact rings, and no alteration of the cluster's trajectory. Timestamps SHALL NOT receive a `data-collider` attribute, keeping them out of the cascade row list. Instead, dissolution SHALL be triggered by a per-frame proximity check during the cluster's hopping and dwelling states.

#### Scenario: Timestamp excluded from cascade row list
- **WHEN** `buildRowList()` queries `[data-collider]` elements
- **THEN** `.meta` timestamp divs SHALL NOT appear in the resulting `rows[]` array
- **AND** the cluster SHALL NOT stop, squash/stretch, or strike at timestamp positions

#### Scenario: Timestamp dissolution triggered by proximity during hop
- **WHEN** the cluster is in `hopping` state and its Y coordinate passes within 60px of a timestamp element's vertical center
- **THEN** the timestamp SHALL dissolve into particles if it has not already been dissolved
- **AND** each character in the timestamp text SHALL become 2–3 small particles (size 1–3px) with colors drawn from `--color-accent` and `--color-text-muted`
- **AND** particles SHALL drift upward with slight horizontal scatter, fading over 600ms
- **AND** the original timestamp element SHALL fade to `opacity: 0` over 300ms

#### Scenario: Timestamp dissolution triggered by proximity during dwell
- **WHEN** the cluster is in `dwell` state (paused at a row after striking) and a timestamp element is within 60px vertical distance of the cluster center
- **THEN** the timestamp SHALL dissolve as described in the hop-triggered scenario

#### Scenario: Timestamp dissolution is one-shot
- **WHEN** a timestamp has been dissolved
- **THEN** subsequent frames SHALL NOT re-trigger dissolution on the same element
- **AND** the dissolved timestamp SHALL be tracked to prevent duplicate particle spawns

#### Scenario: Timestamp dissolution does not affect cluster trajectory
- **WHEN** a timestamp dissolves due to cluster proximity
- **THEN** the cluster's hop arc, velocity, and target SHALL remain unchanged
- **AND** no squash/stretch deformation SHALL occur
- **AND** no `strikeRow()` call SHALL be made

#### Scenario: Both assistant and user timestamps dissolve
- **WHEN** the cluster passes near any `.meta` element (both "dscode · 09:41" and "You · 09:41")
- **THEN** the dissolution behavior SHALL be identical regardless of message role

#### Scenario: Timestamp dissolution particle aesthetics
- **WHEN** a timestamp dissolves
- **THEN** particles SHALL use `--color-accent` for the "dscode" / "You" portion characters
- **AND** particles SHALL use `--color-text-muted` for the separator (·) and time portion characters
- **AND** particles SHALL have initial velocity: vy = rand(-4, -1) [upward], vx = rand(-2, 2) [slight horizontal drift]
- **AND** particle life SHALL be rand(400, 600) ms

---

### Requirement: Three-tier element interaction hierarchy during cascade
The cascade animation SHALL implement a three-tier hierarchy of element interaction: (1) Active Strike — collidable elements with `data-collider` attributes (including thinking blocks) receive full collision physics and type-specific destruction effects; (2) Passive Dissolution — timestamp metadata elements dissolve into particles on cluster proximity without collision; (3) Preserved — no elements currently occupy this tier (thinking blocks moved to Active Strike).

#### Scenario: Active strike tier
- **WHEN** cluster reaches a row with `data-collider` attribute
- **THEN** full hop-step state machine SHALL execute (squash → stretch → dwell → hop)
- **AND** `strikeRow()` SHALL be called with type-specific DOM destruction
- **AND** impact rings and shards SHALL spawn as appropriate for the type

#### Scenario: Passive dissolution tier
- **WHEN** cluster passes within proximity threshold of a timestamp element
- **THEN** dissolution SHALL trigger without affecting cluster state
- **AND** no `strikeRow()`, impact rings, or shards SHALL be generated

#### Scenario: Preserved tier
- **WHEN** cluster passes over an element with no `data-collider` attribute and no `.meta` class
- **THEN** no visual or structural change SHALL occur
- **AND** the cluster SHALL continue its trajectory unchanged