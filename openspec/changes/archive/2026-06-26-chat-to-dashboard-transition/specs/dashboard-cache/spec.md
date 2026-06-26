## ADDED Requirements

### Requirement: Cache hit triggers instant view switch
When a dashboard cache hit occurs on view mode switch, the view mode SHALL switch instantly without triggering the transition animation.

#### Scenario: Cache hit bypasses transition
- **WHEN** user selects "Dashboard" and a valid cache entry exists for the current session with matching contentHash
- **THEN** the frontend SHALL set `artifactHtml` to the cached HTML
- **AND** `viewMode` SHALL be set to `"dashboard"` immediately
- **AND** `transitionPhase` SHALL remain `"idle"` (no animation plays)
- **AND** no `artifact generate` command SHALL be sent
- **AND** the View Mode dropdown SHALL update to show "Dashboard" as selected
