## ADDED Requirements

### Requirement: TUI projects authoritative execution episode state
The TUI SHALL display running, reflecting, paused-inconclusive, and completed episode
states in the conversation hierarchy from HarnessAPI and HarnessEventBus snapshots.
It MUST NOT infer episode phase from spinner state, elapsed time, or absence of output.

#### Scenario: Episode runs tools
- **WHEN** the authoritative episode is running
- **THEN** the TUI shows the episode state above subordinate execution and Tool details

#### Scenario: Reflection starts
- **WHEN** the Host begins the one allowed reflection
- **THEN** the TUI changes the episode label to reflecting while retaining the current Plan and TODO projection

#### Scenario: Episode pauses
- **WHEN** the authoritative phase becomes `paused_inconclusive`
- **THEN** the TUI stops active processing indicators, labels unfinished outcomes unverified, and retains expandable execution details

#### Scenario: Episode completes
- **WHEN** the authoritative phase becomes `completed`
- **THEN** the TUI renders completion without leaving a running Tool or processing indicator

### Requirement: TUI provides keyboard recovery from inconclusive pause
The TUI SHALL expose keyboard-operable Adjust Plan and Continue Execution actions for
the current paused snapshot. It SHALL submit typed recovery commands and render
conflicts from the returned authoritative state.

#### Scenario: User continues execution
- **WHEN** the user activates Continue Execution from a paused episode
- **THEN** the TUI starts a new bounded episode only after HarnessAPI accepts the command

#### Scenario: User adjusts the Plan
- **WHEN** the user activates Adjust Plan from a paused episode
- **THEN** the TUI returns foreground interaction to planning with the saved incident context

#### Scenario: Terminal width is constrained
- **WHEN** the paused state renders in a narrow terminal
- **THEN** labels, reason, progress, and recovery actions wrap without hiding their semantic distinction
