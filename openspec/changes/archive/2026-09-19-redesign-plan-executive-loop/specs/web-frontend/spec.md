## ADDED Requirements

### Requirement: Web Chat renders execution episode state
Web Chat SHALL render running, reflecting, paused-inconclusive, and completed episode
states inside the existing conversation execution hierarchy. The projection SHALL use
the server snapshot and MUST keep Plan, TODO, and episode state visually distinct.

#### Scenario: Episode is running
- **WHEN** the current server snapshot phase is `running`
- **THEN** Chat shows bounded execution activity and the persisted completed-versus-total outcome count

#### Scenario: Episode is reflecting
- **WHEN** the current server snapshot phase is `reflecting`
- **THEN** Chat states that one automatic reflection is in progress without presenting a new Agent persona

#### Scenario: Episode pauses inconclusively
- **WHEN** the current server snapshot phase is `paused_inconclusive`
- **THEN** Chat labels unfinished outcomes `未验证`, preserves their TODO states, and shows the concise incident reason

#### Scenario: Episode is completed
- **WHEN** the authoritative snapshot phase is `completed`
- **THEN** Chat shows completion only for outcomes recorded complete by Plan and TaskState

### Requirement: Web Chat offers explicit paused recovery
When an episode is `paused_inconclusive`, Web Chat SHALL provide Adjust Plan and
Continue Execution actions bound to the current server snapshot. The controls SHALL
disable while their command is pending and SHALL surface typed conflicts by replacing
stale local state with the returned snapshot.

#### Scenario: User chooses Adjust Plan
- **WHEN** the user activates Adjust Plan on the paused state
- **THEN** the client sends the typed adjust command and returns the conversation to Plan alignment when accepted

#### Scenario: User chooses Continue Execution
- **WHEN** the user activates Continue Execution on the paused state
- **THEN** the client sends the typed continue command and renders running only after the server returns the new episode

#### Scenario: Page reloads while paused
- **WHEN** the user reloads or reconnects to a paused Session
- **THEN** the same paused state and recovery actions are restored without automatic execution

### Requirement: Web execution state is accessible and layout-stable
Episode labels, progress, reasons, and actions SHALL remain readable in supported light
and dark themes and at desktop and mobile widths. State SHALL be conveyed by text in
addition to color, and controls SHALL have keyboard focus and accessible names.

#### Scenario: Narrow viewport shows recovery actions
- **WHEN** the paused state renders at a mobile width
- **THEN** reason text and both recovery actions remain visible without horizontal overflow or overlap

#### Scenario: Keyboard user reviews pause
- **WHEN** focus reaches a paused episode
- **THEN** the state, unverified outcome count, reason, and both action names are available to assistive technology
