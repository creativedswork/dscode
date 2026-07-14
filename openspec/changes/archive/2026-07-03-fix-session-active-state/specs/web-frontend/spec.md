## ADDED Requirements

### Requirement: Active session visual indicator
The session list in the sidebar SHALL visually distinguish the currently active session item from inactive ones. The active session item SHALL display a subtle accent-tinted background using `var(--color-accent-bg)`.

#### Scenario: Active session highlighted with accent background
- **WHEN** the user clicks a session item to load it, and that session becomes the active session
- **THEN** the session item's background changes to `var(--color-accent-bg)`, making it visually identifiable within the session list

#### Scenario: Only one session highlighted at a time
- **WHEN** the user switches from session A to session B
- **THEN** session B's row displays `var(--color-accent-bg)` and session A's row reverts to transparent background

#### Scenario: Inactive sessions have no accent background
- **WHEN** a session item is not the currently active session
- **THEN** its background is transparent, with hover state using `var(--color-surface-hover)`

#### Scenario: Active session background persists during processing
- **WHEN** `isProcessing` is true and a session is the active session
- **THEN** the active session item continues to display `var(--color-accent-bg)`, and the row remains at full opacity (not dimmed like inactive rows)
