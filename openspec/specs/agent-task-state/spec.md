# agent-task-state Specification

## Purpose
TBD - created by archiving change add-interactive-plan-mode. Update Purpose after archive.
## Requirements
### Requirement: Main Agent context owns current task state
The system SHALL store the current task as a versioned `TaskState` in the Main
Agent's persisted context. `TaskState` SHALL identify the request and Session,
contain the task status and ordered `todoList`, and optionally reference the
authorized Plan revision that informed execution. PlanRecord, Session
transcript, assistant prose, Tool history, and UI reducer state MUST NOT be the
authoritative source of the TODO list.

#### Scenario: Main starts tracked work
- **WHEN** a request requires multiple observable outcomes or execution must remain recoverable across turns
- **THEN** Main creates `TaskState` in its context before presenting a TODO list

#### Scenario: Simple request does not need tracking
- **WHEN** Main can complete a request atomically without useful intermediate outcome state
- **THEN** Main may execute without creating `TaskState.todoList`

#### Scenario: Direct execution needs multiple milestones
- **WHEN** autonomous routing selects Direct but the work still benefits from progress tracking
- **THEN** Main may create and maintain TaskState without creating a PlanRecord

#### Scenario: Session context is restored
- **WHEN** a Session reconnects, restarts, or becomes selected again
- **THEN** the system restores that Session's highest-version Main TaskState from persisted Agent context into the current Main Process, including when the prior Main Process was replaced, rather than reconstructing TODO from Plan items or transcript text

### Requirement: TODO items record observable outcome state
Each `TodoItem` SHALL describe a user-understandable outcome whose current state
is useful for answering what has been completed, what is in progress, and what
remains. File creation, component implementation, style work, Tool calls,
commands, retries, debugging, and verification activity MUST remain internal
steps unless that activity itself is the user-requested deliverable.

#### Scenario: Complex game implementation is tracked
- **WHEN** Main implements a playable game with core mechanics, desktop play, and mobile/offline support
- **THEN** TODO may contain those observable outcomes as separate items instead of one item for the entire game or one item per file, implementation phase, or test

#### Scenario: Several outcomes modify one file
- **WHEN** multiple TodoItems require changes to the same workspace path
- **THEN** the system permits those items because workspace ownership does not define user-visible outcome boundaries

#### Scenario: Main runs verification
- **WHEN** Main runs syntax checks, unit tests, smoke tests, or browser checks while producing an outcome
- **THEN** those checks do not create separate TodoItems unless the requested deliverable is a test or audit report

#### Scenario: User validation remains outside Agent work
- **WHEN** a result would benefit from optional manual inspection
- **THEN** Main reports the inspection gap in its final response without adding a user-operated TODO

### Requirement: Main maintains TODO as execution evolves
Main SHALL update TaskState through typed, version-checked context mutations.
The mutation API SHALL support initializing, appending, revising, splitting,
merging, reordering, transitioning, skipping, and reopening TodoItems while
preserving stable `todoId` values and committed history.

#### Scenario: Plan seeds initial outcomes
- **WHEN** Planner authorizes a Plan and transfers execution to Main
- **THEN** Main initializes outcome-oriented TODO for the authorized goal without projecting PlanExecutionSteps into TodoItems, after which TaskState becomes the authoritative TODO source

#### Scenario: Execution reveals another outcome
- **WHEN** implementation discovers additional user-visible work within the approved goal and scope
- **THEN** Main appends or refines TodoItems without changing the Plan revision

#### Scenario: One outcome becomes independently observable
- **WHEN** execution shows that one pending outcome contains independently demonstrable results whose separate state is useful to the user
- **THEN** Main splits the item through one typed mutation that retains provenance and stable identities for the resulting TodoItems

#### Scenario: Several items describe one outcome
- **WHEN** separate TodoItems turn out to be implementation phases or checks for the same observable result
- **THEN** Main merges them through one typed mutation and preserves their prior titles in committed history

#### Scenario: Execution changes semantic intent
- **WHEN** a TODO change requires a different goal, hard constraint, selected decision, or side-effect scope
- **THEN** Main requests replanning before executing the semantic change

#### Scenario: Completed history becomes obsolete
- **WHEN** a later discovery makes a pending or completed item no longer applicable
- **THEN** Main marks it `skipped` with a reason or explicitly reopens it with a reason instead of silently deleting it

### Requirement: TaskState gates planned execution binding
Before `plan_start_item` binds an execution step, the owning Main Agent SHALL
have an active TaskState for its current Session. `TaskState.sourcePlan` SHALL
match the current Plan's planId, revision, and digest exactly. Host MUST reject
the binding before mutation when any identity or state check fails and MUST NOT
create TaskState or TodoItems by projecting PlanExecutionSteps.

#### Scenario: Matching TaskState exists
- **WHEN** owning Main calls `plan_start_item` with an active same-Session TaskState whose sourcePlan identity exactly matches
- **THEN** Host may continue with the normal Plan version, authorization, scope, and binding checks

#### Scenario: TaskState is absent
- **WHEN** owning Main calls `plan_start_item` before initializing TaskState
- **THEN** Host rejects the call and directs Main to use `task_update initialize`

#### Scenario: TaskState does not own this Plan execution
- **WHEN** TaskState is terminal, belongs to another Session, lacks sourcePlan, or differs in planId, revision, or digest
- **THEN** Host rejects the call before Plan execution state or Main binding changes

### Requirement: TODO transitions preserve truthful progress
TodoItem status SHALL be `pending | in_progress | completed | blocked |
skipped`. At most one item may be `in_progress`. A completed item SHALL include
a concise result summary. TaskState SHALL become `completed` only when every
non-skipped TodoItem is completed and any required Plan verification has
passed.

#### Scenario: Main begins the next outcome
- **WHEN** Main starts a pending TodoItem
- **THEN** any previously active item is completed, blocked, skipped, or returned to pending before the next item becomes `in_progress`

#### Scenario: Outcome is produced
- **WHEN** Main has produced the observable result represented by an in-progress TodoItem
- **THEN** Main marks it completed with a result summary and advances TaskState version

#### Scenario: Required verification remains unsatisfied
- **WHEN** Main requests terminal task completion while an authorized Plan still has an unmet required verification
- **THEN** Host rejects terminal completion, leaves the relevant TODO state unchanged, and reports the unmet internal check without inventing a blocker

#### Scenario: Completed Plan enters report phase
- **WHEN** all required Plan verification has passed but delivered TodoItems remain pending or in progress
- **THEN** Main uses legal TaskState transitions to complete only the outcomes actually delivered before issuing the final report

#### Scenario: Final report describes incomplete evidence
- **WHEN** an outcome or verification was not completed
- **THEN** Main preserves truthful TaskState and lists the unverified item or remaining gap instead of claiming it passed

#### Scenario: A Tool or SubAgent completes
- **WHEN** a Tool succeeds or a SubAgent exits successfully
- **THEN** the result is recorded as runtime evidence but does not directly create, rename, or complete a TodoItem

### Requirement: Blocked means an unresolved external dependency
A TodoItem or TaskState SHALL enter `blocked` only with a structured blocker
that Main cannot currently resolve autonomously. The blocker SHALL identify its
kind, a public reason, and a recovery action. Supported blocker kinds SHALL be
limited to a missing user decision, unavailable required permission,
unavailable external dependency, or an environment constraint.

#### Scenario: User decision is required
- **WHEN** work cannot continue without a user-value decision that cannot be inferred
- **THEN** the active TodoItem may become blocked with the pending decision and its recovery action

#### Scenario: Required external service is unavailable
- **WHEN** all approved alternatives require an external dependency that is currently unavailable
- **THEN** Main may mark the item blocked and identify what availability change permits resumption

#### Scenario: Execution attempt fails but remains recoverable
- **WHEN** a Tool fails, a verification fails, an edit anchor becomes stale, or a SubAgent exits unsuccessfully and Main can still retry or use another approved action
- **THEN** the TodoItem remains in progress and no blocker is created

#### Scenario: Continuation budget is exhausted
- **WHEN** Host stops automatic follow-ups because the continuation budget is exhausted
- **THEN** Runtime becomes paused or idle while TaskState and the active TodoItem remain unchanged

#### Scenario: External blocker is resolved
- **WHEN** the recorded recovery condition becomes satisfied
- **THEN** Main transitions the blocked TodoItem back to `in_progress` without requiring a Plan revision unless semantic Plan content also changed

### Requirement: TaskState projection is presentation-neutral
The system SHALL emit an immutable `task:updated` snapshot after each committed
TaskState mutation. Shared Web and TUI reducers SHALL project TodoItem title,
status, result, and public blocker summary without exposing internal Plan
verification, Tool evidence, runtime counters, hidden prompts, or private
reasoning.

#### Scenario: Task progress changes
- **WHEN** Main commits a TodoItem transition
- **THEN** Web and TUI update the existing TODO projection from the new TaskState version

#### Scenario: Stale task event arrives
- **WHEN** a client receives a TaskState version older than the version already projected
- **THEN** the client ignores the stale snapshot

#### Scenario: No task state exists
- **WHEN** the selected Session has no active or retained TaskState
- **THEN** the UI shows no TODO list even if an internal PlanRecord exists

#### Scenario: Task and Plan events arrive independently
- **WHEN** `plan_state` and `task_state` arrive in either order
- **THEN** the UI independently restores the global Plan and TODO and preserves their visual ordering without deriving either object from the other
