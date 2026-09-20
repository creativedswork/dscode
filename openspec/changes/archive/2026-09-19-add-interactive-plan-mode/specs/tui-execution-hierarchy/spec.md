## ADDED Requirements

### Requirement: TUI keeps planning under Agent control
The TUI SHALL keep a single Chat input and SHALL NOT expose an `Auto / Plan`
mode, dedicated Plan panel, Plan page, or Plan/Execution hierarchy.

#### Scenario: User submits a request
- **WHEN** the user sends a Chat message
- **THEN** Main Agent autonomously chooses direct execution or internal planning

#### Scenario: Internal planning progresses
- **WHEN** the Planner investigates, selects a technical path, backtracks, or replans
- **THEN** existing Turn, Execution, and Tool views continue normally without a separate Plan surface

### Requirement: TUI renders one global Plan output inline
After internal authorization, the TUI SHALL derive one user-readable global Plan
output from the persisted PlanRecord, render it before TODO, and keep it collapsed
by default without introducing a dedicated Plan panel.

#### Scenario: Authorized Plan appears
- **WHEN** Planner authorizes executable items
- **THEN** the conversation shows a collapsed Plan row with title and status before the live TODO without presenting PlanExecutionStep count as task count

#### Scenario: User expands the Plan
- **WHEN** the Plan row has focus and the user presses Enter
- **THEN** it reveals goal, committed constraints, selected approach, scope, ordered steps, and verification while hiding internal Plan metadata

#### Scenario: Session restores or Plan is revised
- **WHEN** TUI restores an authorized Plan or receives a newly authorized revision
- **THEN** it restores or replaces the single Plan output in collapsed state without duplicating it

### Requirement: TUI projects TODO from Main TaskState
The TUI SHALL render at most one current TODO list from the selected Session's
Main Agent TaskState. It MUST NOT derive TodoItems or statuses from Plan steps,
verification, Tool rows, Execution nodes, AgentProcess state, or continuation
budget.

#### Scenario: Planned work initializes TaskState
- **WHEN** Main initializes TaskState after Plan authorization
- **THEN** TUI renders the outcome-oriented TodoItems after the collapsed Plan row

#### Scenario: Direct work initializes TaskState
- **WHEN** a Direct request creates TaskState without a PlanRecord
- **THEN** TUI renders TODO without an empty or synthetic Plan row

#### Scenario: TaskState advances
- **WHEN** TUI receives a newer `task_state` snapshot
- **THEN** it updates the existing TODO in place and ignores older TaskState versions

#### Scenario: Automatic continuation stops
- **WHEN** Runtime exhausts its continuation budget
- **THEN** TUI preserves the current in-progress TodoItem and does not display it as blocked unless TaskState contains a structured external blocker

#### Scenario: Session changes
- **WHEN** TUI switches Sessions or reconnects
- **THEN** it clears the prior TODO and restores only the selected Session's retained TaskState

### Requirement: TUI renders intent alignment inline
Pending user-value decisions SHALL appear in the conversation area as an inline
Chat interaction, not as a bottom Plan panel or Tool row.

#### Scenario: Alignment is pending
- **WHEN** the Agent cannot infer a visual, scope, or compatibility preference
- **THEN** TUI shows the one persisted pending requirement as a concise question, exactly one recommendation, at most three options, and a custom-text path

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

### Requirement: TUI separates execution narration from final reporting
The TUI SHALL hide intermediate assistant narration produced during automatic
Plan execution and SHALL render one visible final report after a completed
Plan. The report SHALL cover delivered results, verification actually run and
its conclusions, and anything unverified or still missing.

#### Scenario: Main narrates internal execution
- **WHEN** an execution-phase assistant message contains no user-facing final report
- **THEN** TUI excludes it from live conversation and Session replay

#### Scenario: Completed Plan enters report phase
- **WHEN** Plan bindings are cleared but the owning Main remains alive
- **THEN** TUI continues processing TaskState updates and then renders exactly one final report

#### Scenario: Plan is cancelled or failed
- **WHEN** terminal cleanup terminates Main
- **THEN** TUI does not fabricate the completed-report flow

### Requirement: Existing permission interaction remains authoritative
The TUI SHALL continue to use the existing permission flow for protected side
effects and SHALL NOT add whole-Plan approval.

#### Scenario: Execution reaches a protected tool
- **WHEN** Harness policy requires user permission
- **THEN** the existing permission interaction is shown with its current keyboard behavior
