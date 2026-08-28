## ADDED Requirements

### Requirement: TUI keeps planning under Agent control
The TUI SHALL keep a single Chat input and SHALL NOT expose an `Auto / Plan`
mode, dedicated Plan panel, Plan summary, or Plan/Execution hierarchy.

#### Scenario: User submits a request
- **WHEN** the user sends a Chat message
- **THEN** Main Agent autonomously chooses direct execution or internal planning

#### Scenario: Internal planning progresses
- **WHEN** the Planner investigates, selects a technical path, backtracks, or replans
- **THEN** existing Turn, Execution, and Tool views continue normally without a separate Plan surface

### Requirement: TUI renders intent alignment inline
Pending user-value decisions SHALL appear in the conversation area as an inline
Chat interaction, not as a bottom Plan panel or Tool row.

#### Scenario: Alignment is pending
- **WHEN** the Agent cannot infer a visual, scope, or compatibility preference
- **THEN** TUI shows one concise question, an optional recommendation, at most three options, and a custom-text path

#### Scenario: User chooses by keyboard
- **WHEN** the inline interaction has focus
- **THEN** arrow keys move selection, Enter confirms, and Esc returns to Chat without approving an entire Plan

### Requirement: TUI restores pending Chat alignment
The TUI SHALL reconstruct the current inline alignment after startup, reconnect,
and Session switch while keeping internal Plan state hidden.

#### Scenario: Pending alignment is restored
- **WHEN** TUI attaches to a Session with a persisted unresolved interaction
- **THEN** that interaction appears once in the conversation area with the current options

#### Scenario: No alignment is pending
- **WHEN** TUI attaches to a Session whose Agent can continue autonomously
- **THEN** no stale planning or alignment UI from the previous Session remains

### Requirement: Existing permission interaction remains authoritative
The TUI SHALL continue to use the existing permission flow for protected side
effects and SHALL NOT add whole-Plan approval.

#### Scenario: Execution reaches a protected tool
- **WHEN** Harness policy requires user permission
- **THEN** the existing permission interaction is shown with its current keyboard behavior
