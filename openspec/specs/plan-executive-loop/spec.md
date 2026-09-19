# plan-executive-loop Specification

## Purpose
TBD - created by archiving change redesign-plan-executive-loop. Update Purpose after archive.
## Requirements
### Requirement: Approved Plan execution runs in bounded episodes
The Host SHALL run each automatic attempt to execute an approved Plan as an
execution episode with finite turn, Tool Call, no-progress, and equivalent-action
budgets. The Host MUST stop the model loop after the current turn when any applicable
budget is exhausted.

#### Scenario: Main starts approved execution
- **WHEN** Main begins executing a Plan with a valid revision, digest, authorization, and TaskState
- **THEN** the Host creates a running episode with fresh counters and the configured finite budgets

#### Scenario: Tool Calls continue within one turn
- **WHEN** the Tool Call budget is reached while the current model turn continues to request tools
- **THEN** the Host prevents another model turn through the loop stop predicate after the current turn ends

#### Scenario: Distinct actions exhaust the hard budget
- **WHEN** actions remain distinct but the episode reaches its turn or Tool Call limit without completing the task
- **THEN** the Host declares an impasse instead of allowing unbounded execution

### Requirement: Progress is derived from committed outcome state
The Executive Monitor SHALL recognize progress only when committed state gains a
passing Plan verification, changes a Plan execution step status, or changes a
TaskState or TodoItem outcome. Tool success, file mutation, transcript growth,
evidence count, timestamps, token use, and record version increments MUST NOT count
as progress by themselves.

#### Scenario: Verification newly passes
- **WHEN** persisted evidence changes a declared verification from not passing to passing
- **THEN** the monitor records semantic progress and resets current no-progress counters

#### Scenario: Tool succeeds without changing an outcome
- **WHEN** a write or command Tool reports success but verification, step, and TaskState outcome snapshots remain equal
- **THEN** the monitor increments no-progress accounting

#### Scenario: Only Plan version changes
- **WHEN** Plan version or evidence count increases while all accepted progress fields remain equal
- **THEN** the monitor treats the execution as having made no progress

#### Scenario: TODO wording is revised
- **WHEN** a TodoItem title, order, history, or timestamp changes without an outcome transition
- **THEN** the monitor does not reset no-progress accounting

### Requirement: Equivalent actions use stable semantic fingerprints
The Host SHALL fingerprint completed actions from canonical Tool identity, normalized
semantic arguments, and outcome class. Fingerprints MUST exclude volatile protocol
values and MUST be retained only within a bounded monitoring window.

#### Scenario: Equivalent edits vary only in volatile fields
- **WHEN** repeated edit calls target the same semantic resource and operation but use different call IDs, timestamps, formatting, or generated evidence IDs
- **THEN** the monitor assigns them the same action fingerprint

#### Scenario: Outcome class changes
- **WHEN** otherwise equivalent actions finish with different succeeded, rejected, failed, or inconclusive outcomes
- **THEN** their fingerprints remain distinguishable by outcome class

#### Scenario: Unknown Tool has no dedicated normalizer
- **WHEN** the monitor observes an unknown Tool
- **THEN** it fingerprints canonical JSON arguments after removing known volatile protocol fields

### Requirement: The Host permits at most one automatic reflection
The first impasse in an execution attempt SHALL end the current episode and start one
bounded reflection episode on the same Main Agent. A second impasse after reflection
has been used MUST NOT start another automatic reflection.

#### Scenario: Initial episode reaches an impasse
- **WHEN** equivalent-action, no-progress, turn, or Tool Call policy first reaches its threshold
- **THEN** the Host persists an incident summary and starts one reflection episode with a Host-authored resume frame

#### Scenario: Reflection finds semantic progress
- **WHEN** the reflection episode changes an accepted progress field
- **THEN** no-progress counters reset and the execution may continue while reflection remains marked as used

#### Scenario: Execution stalls after reflection
- **WHEN** any later impasse occurs after the automatic reflection has been used
- **THEN** the Host pauses execution inconclusively without starting another reflection

### Requirement: Inconclusive pause preserves truthful task state
An automatic impasse after reflection SHALL set execution phase to
`paused_inconclusive`. It MUST preserve the Plan revision, digest, authorization,
step states, execution bindings, TaskState, and TODO, and MUST NOT infer blocked,
failed, skipped, or completed outcomes.

#### Scenario: Repetition continues after reflection
- **WHEN** the reflection episode reaches an impasse with outcomes still unverified
- **THEN** execution becomes `paused_inconclusive` and the current in-progress and pending TODO items remain unchanged

#### Scenario: Pause has no external blocker
- **WHEN** execution pauses because its monitor budget is exhausted
- **THEN** the system labels the result unverified rather than blocked or failed

#### Scenario: Client disconnects during pause
- **WHEN** all clients disconnect and later reconnect
- **THEN** the persisted episode remains paused and is not automatically resumed

### Requirement: Paused execution has explicit adjust and continue recovery
The system SHALL expose idempotent commands to adjust the Plan or continue execution
from a `paused_inconclusive` snapshot. Continuing SHALL create a new bounded episode
and MUST NOT carry over exhausted counters. Neither recovery command may bypass Plan
version, digest, ownership, or authorization checks.

#### Scenario: User continues the same Plan
- **WHEN** the user submits a valid continue command for the current paused revision and digest
- **THEN** the Host creates a new running episode with fresh budgets and retained verified progress

#### Scenario: User adjusts the approach
- **WHEN** the user submits a valid adjust command from the paused state
- **THEN** foreground control returns to planning with the incident and committed outcome snapshot as context

#### Scenario: Stale client resumes an old revision
- **WHEN** a continue command names a revision or digest that no longer matches the current Plan
- **THEN** the Host rejects the command and returns the current snapshot

#### Scenario: Duplicate recovery command is retried
- **WHEN** the same command ID and payload are delivered more than once
- **THEN** the Host returns the original receipt without starting duplicate episodes

### Requirement: Episode and incident persistence is bounded
The system SHALL persist the current episode snapshot, a bounded recent fingerprint
window, and concise incident summaries needed for recovery. PlanStore SHALL retain
acceptance evidence needed to reproduce current verification results and MUST NOT
append every Tool result or Agent progress event as durable Plan evidence.

#### Scenario: Repeated Tool output does not satisfy verification
- **WHEN** many Tool Calls produce results that do not pass a declared verification
- **THEN** the complete results remain in Session or Process trace while PlanStore retains only bounded incident data

#### Scenario: Evidence satisfies a matcher
- **WHEN** evidence passes a declared Plan verification
- **THEN** PlanStore retains the evidence or stable trace reference needed to reproduce that result

#### Scenario: Process restarts while paused
- **WHEN** the Host restores a Plan whose current episode is `paused_inconclusive`
- **THEN** it restores the same progress snapshot, incident summary, and available recovery commands

### Requirement: Completion requires Plan and TaskState agreement
An episode SHALL enter `completed` only when persisted Plan verifications complete all
required execution steps and the owning TaskState records all required user-visible
outcomes as completed or explicitly skipped. Episode budget exhaustion MUST NOT
produce completion.

#### Scenario: Plan passes but TaskState is still active
- **WHEN** all Plan steps pass but a required TodoItem remains pending or in progress
- **THEN** the Host enters the existing final-report reconciliation flow rather than marking the episode completed

#### Scenario: Both truth sources complete
- **WHEN** all required Plan steps and TaskState outcomes are terminal and successful
- **THEN** the Host marks the episode completed and emits the final execution snapshot

#### Scenario: Budget ends with unfinished work
- **WHEN** an episode budget is exhausted while either truth source remains incomplete
- **THEN** the Host follows impasse handling and does not emit completion
