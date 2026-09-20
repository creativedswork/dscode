# interactive-plan-mode Specification

## Purpose
TBD - created by archiving change add-interactive-plan-mode. Update Purpose after archive.
## Requirements
### Requirement: Request submission uses autonomous routing
The product SHALL expose one Chat submission path. Main Agent SHALL autonomously
choose direct execution, internal planning, or Chat-native intent alignment and
SHALL NOT require the user to select a planning mode.

#### Scenario: User submits a request
- **WHEN** a user sends a Chat message
- **THEN** the system evaluates the request through the autonomous routing path

#### Scenario: Request requires internal planning
- **WHEN** the assessment selects planning
- **THEN** the system starts the Planner without exposing a separate product mode

#### Scenario: User inspects the composer
- **WHEN** the user opens Web or TUI Chat
- **THEN** the UI presents one input and no Auto, Plan, or force-Direct control

### Requirement: Auto routing is decided before the first side effect
For an Auto request, the system MUST obtain a structured complexity assessment before the Main Agent's first mutating tool call. Read-only investigation MAY occur before the assessment.

#### Scenario: Simple request continues directly
- **WHEN** the assessment has zero intent uncertainty, no impact, risk, or coordination dimension at level `2`, and its total score is less than `4`
- **THEN** the system records a Direct route decision and allows the Main Agent to continue without starting a Planner

#### Scenario: Complex request enters Plan Mode
- **WHEN** intent uncertainty is non-zero, impact, risk, or coordination is level `2`, or the total complexity score is at least `4`
- **THEN** the system blocks the pending side effect and transfers foreground control to a Planner process

#### Scenario: Mutation is attempted without an assessment
- **WHEN** an Auto request reaches a mutating tool without a valid route decision
- **THEN** the execution guard rejects the mutation and requires a route assessment

#### Scenario: Assessment and mutation share one tool-call batch
- **WHEN** one model response requests a route assessment and a mutating tool concurrently
- **THEN** the system commits only the assessment result and requires any Direct mutation to be requested again after the route decision is active

### Requirement: Complexity assessment is structured and auditable
The assessment SHALL score intent uncertainty, alternative divergence, impact
radius, operational risk, and coordination complexity from `0` through `2`.
It SHALL include concise evidence summaries without private reasoning and an
array of unresolved alignment requirements. Each requirement SHALL have a
stable ID, one topic from `visual_direction | delivery | product_scope |
compatibility | cost | reversibility | other`, a public summary, and initial
status `pending`.

#### Scenario: Assessment is accepted
- **WHEN** all five dimensions, supporting evidence, and request identity are present
- **THEN** the Host computes the route using the deterministic policy

#### Scenario: Genre convention does not replace creative direction
- **WHEN** a request creates a user-visible artifact without an explicit visual direction and the assessment reports zero intent uncertainty
- **THEN** the Host treats intent uncertainty as at least `1`, injects a pending `visual_direction` requirement if none exists, and computes the route from the amended assessment

#### Scenario: Assessment and requirements disagree
- **WHEN** intent uncertainty is zero with pending requirements, or non-zero without a pending requirement
- **THEN** the Host rejects the assessment and keeps mutating tools gated

#### Scenario: Assessment is malformed
- **WHEN** a dimension is missing, outside `0..2`, or not associated with the active request
- **THEN** the system rejects the assessment and keeps mutating tools gated

### Requirement: Planner runs as an isolated foreground Agent Process
The system SHALL run planning through an internal Planner AgentApplication managed by AgentSupervisor. The Planner MUST use `permissionMode: plan`, MUST have no mutating tools, and MUST NOT dynamically acquire execution capabilities.

#### Scenario: Complex request starts Planner
- **WHEN** routing selects Plan Mode
- **THEN** AgentSupervisor starts a Planner process whose parent is the Main Agent and places the Main Agent in `waiting`

#### Scenario: Planner attempts a side effect
- **WHEN** the Planner requests a mutating tool
- **THEN** tool filtering rejects the request and the Plan remains unapproved

#### Scenario: Planner sees a tool with unknown effects
- **WHEN** a tool has missing or `unknown` effect metadata
- **THEN** the Planner capability set excludes that tool by default

#### Scenario: Planner waits for intent alignment
- **WHEN** the current decision requires a missing user-value constraint
- **THEN** the Planner process enters `waiting` while retaining a recoverable process snapshot

#### Scenario: Validated planning completes
- **WHEN** the active revision is internally validated and no user-value interaction remains pending
- **THEN** the Planner exits, Supervisor returns foreground control to the Main Agent, and Main automatically starts an internal continuation that executes the authorized Plan steps and initializes its context-owned TaskState

#### Scenario: Main resumes an approved Plan
- **WHEN** Planner has persisted and internally authorized a Plan
- **THEN** Main receives the approved Plan, binds each internal execution step before side effects, creates outcome-oriented TODO state in its own context, and continues without waiting for another user message

#### Scenario: Main starts the first execution step
- **WHEN** owning Main calls `plan_start_item`
- **THEN** Host requires an active TaskState for Main's current Session whose `sourcePlan` exactly matches the Plan's planId, revision, and digest before it writes any execution binding

#### Scenario: Plan execution starts without matching task state
- **WHEN** TaskState is missing, terminal, owned by another Session, or has a missing or mismatched sourcePlan identity
- **THEN** Host rejects `plan_start_item`, requires `task_update initialize`, leaves the Plan unbound, and does not derive TodoItems from PlanExecutionSteps

#### Scenario: Main attempts to finish an incomplete Plan
- **WHEN** Main produces a no-tool response while its TaskState remains active
- **THEN** Host first reconciles required Plan verification and then may queue a hidden continuation so Main continues from the authoritative TaskState instead of reporting the request complete

#### Scenario: Incomplete execution makes no progress
- **WHEN** bounded hidden continuations do not advance TaskState
- **THEN** Host stops automatic continuation and preserves the active TodoItem status; it MUST NOT infer a user-visible blocker from the continuation budget

### Requirement: Plan Mode uses bounded RAP-lite decisions
The Planner SHALL model planning as decision nodes with candidates, evidence, trade-offs, selection, and optional backtracking. A decision node MUST contain at most three candidates and a revision MUST contain at most six decision nodes.

#### Scenario: Multiple viable candidates remain
- **WHEN** two or more non-dominated candidates satisfy the hard constraints
- **THEN** the Planner selects the best-supported technical path unless the difference changes a user-visible outcome or explicit product constraint

#### Scenario: Only one candidate satisfies hard constraints
- **WHEN** exactly one candidate remains feasible
- **THEN** the Planner may select it automatically and records a public rationale

#### Scenario: Decision budget is reached
- **WHEN** generating another decision node would exceed the revision limit
- **THEN** the Planner selects the safest feasible path, or asks one Chat-native question only when a missing user-value constraint prevents selection

#### Scenario: Agent backtracks
- **WHEN** new evidence invalidates an earlier technical decision
- **THEN** later unapproved decisions are invalidated and the Plan advances to a new revision

### Requirement: Plan decision commands have explicit actions
The system SHALL represent candidate selection, further investigation, constraint updates, and backtracking as distinct typed actions.

#### Scenario: Candidate is selected
- **WHEN** a decision command has action `select`
- **THEN** it identifies the decision node and selected option

#### Scenario: Further investigation is requested
- **WHEN** a decision command has action `investigate`
- **THEN** Planner gathers additional read-only evidence for the identified node or option without selecting it

#### Scenario: Constraints are updated
- **WHEN** a decision command has action `update_constraints`
- **THEN** PlanService validates the constraint patch, advances semantic revision, and invalidates downstream decisions

#### Scenario: Backtrack is requested
- **WHEN** a decision command has action `backtrack`
- **THEN** it identifies the target decision node and invalidates later unapproved decisions

### Requirement: Human interaction is reserved for value-bearing decisions
The Planner SHALL request Chat-native user input only when a choice changes a
user-visible outcome, product scope, compatibility promise, cost, or
reversibility and the preference cannot be inferred. Technical choices and
whole-Plan approval SHALL remain internal. Every decision SHALL identify
exactly one recommended candidate before persistence. A decision that addresses
alignment SHALL identify at most one pending requirement through
`resolvesRequirementIds`.

#### Scenario: Equivalent implementation detail
- **WHEN** candidate differences do not affect user-visible trade-offs or hard constraints
- **THEN** the Planner resolves the detail without interrupting the user and records a summary

#### Scenario: Choice changes compatibility
- **WHEN** viable candidates preserve different user-visible compatibility guarantees that were not specified
- **THEN** the Planner pauses and asks one Chat-native alignment question

#### Scenario: Planner omits or duplicates the recommendation
- **WHEN** a proposed decision marks zero or multiple candidates as recommended
- **THEN** the Host rejects the decision before persistence and no ambiguous alignment reaches Web or TUI

#### Scenario: Planner addresses multiple alignment requirements at once
- **WHEN** a proposed decision names more than one requirement in `resolvesRequirementIds`
- **THEN** the Host rejects the decision and requires one persisted interaction per requirement

#### Scenario: Technical decision is selected
- **WHEN** Planner selects a technical decision without consuming a matching persisted human interaction
- **THEN** no alignment requirement changes status

#### Scenario: User selects a candidate
- **WHEN** a matching persisted interaction is consumed by a candidate selection
- **THEN** exactly that requirement becomes `resolved` and records the decision node in `resolvedByDecisionNodeId`

#### Scenario: User supplies a custom constraint
- **WHEN** a matching persisted interaction is consumed by a user-sourced constraint update
- **THEN** exactly that requirement becomes `resolved`, while `resolvedByDecisionNodeId` may remain absent

#### Scenario: Alignment requirement remains pending
- **WHEN** any alignment requirement is still `pending`
- **THEN** both Plan compilation and internal authorization reject the Plan

### Requirement: PlanRecord is the persistent source of truth
The system SHALL persist each complex task as a project-scoped PlanRecord independent of Session transcript and Agent runtime state.

#### Scenario: Plan is created
- **WHEN** a request enters Plan Mode
- **THEN** PlanStore atomically persists a record containing plan identity, request identity, goal, constraints, optional alignment requirements, status, version, revision, digest, decisions, immutable execution steps, mutable execution state, pending interaction, command receipts, trajectory events, and timestamps

#### Scenario: Legacy Plan has no alignment requirements
- **WHEN** PlanStore reads schema v1 or an earlier schema v2 record that omits `alignmentRequirements`
- **THEN** it accepts the record without inserting the field or changing its existing digest

#### Scenario: Simple request executes directly
- **WHEN** Auto routing selects Direct Execution
- **THEN** the system does not create a persistent PlanRecord or Planner process for that request

#### Scenario: Session transcript is rebuilt
- **WHEN** conversation messages are replayed
- **THEN** the Plan projection is loaded from PlanStore rather than inferred from assistant text or tool history

### Requirement: Store version and semantic revision are distinct
PlanRecord SHALL contain a monotonic `version` used for persistence CAS and a `revision` used for semantic Plan content and approval. Every committed write MUST increment version exactly once; only semantic Plan changes SHALL increment revision and recompute digest.

#### Scenario: Approval is persisted
- **WHEN** approval is committed without changing semantic Plan content
- **THEN** version increments while revision and digest remain unchanged

#### Scenario: Decision changes the Plan
- **WHEN** selection, constraints, execution steps, verification definitions, or side effects change
- **THEN** version and revision each increment and digest is recomputed

#### Scenario: TODO progress changes
- **WHEN** Main adds, revises, reorders, or transitions a TodoItem without changing Plan semantics
- **THEN** TaskState version increments while PlanRecord version, revision, digest, and authorization remain unchanged

### Requirement: PlanStore updates use atomic version compare-and-swap
Every PlanRecord update MUST provide `expectedVersion`, MUST execute under a per-plan write lock, and MUST be written through a temporary file, file fsync, atomic rename, and parent-directory fsync.

#### Scenario: Version matches
- **WHEN** an update holds the plan lock and supplies the current version
- **THEN** PlanStore commits the update atomically, increments version, and returns the new snapshot

#### Scenario: Version is stale
- **WHEN** an update supplies an older version
- **THEN** PlanStore rejects the update, preserves the current file, and returns a conflict containing the current snapshot

#### Scenario: Two processes update the same Plan
- **WHEN** two Host processes attempt to update one planId concurrently
- **THEN** an exclusive lock serializes re-read and commit so at most one update can match the prior version

#### Scenario: Process terminates during write
- **WHEN** the process stops before atomic rename completes
- **THEN** the last committed PlanRecord remains readable and no partial JSON becomes authoritative

#### Scenario: Stale write lock remains
- **WHEN** a lock exceeds its timeout and its recorded owner process is no longer alive
- **THEN** PlanStore may recover the lock before retrying version validation

### Requirement: Plan digest covers semantic execution intent
The system SHALL compute a deterministic digest over the goal, constraints,
present alignment requirements, selected decisions, immutable
PlanExecutionStep definitions, structured verification, effect grants, and
side-effect summary. PlanExecutionState, TaskState, TodoItems, evidence,
execution binding, approval, runtime progress, telemetry, and non-semantic
timestamps MUST NOT affect the digest. When a legacy record omits
`alignmentRequirements`, canonicalization MUST preserve that absence.

#### Scenario: Semantic plan content changes
- **WHEN** a selected path, constraint, immutable execution step definition, verification rule, effect grant, or side-effect summary changes
- **THEN** the resulting revision has a different digest

#### Scenario: Agent progress changes
- **WHEN** only PlanExecutionState, TaskState, evidence, execution binding, approval, Agent progress, or timing telemetry changes
- **THEN** the Plan digest remains unchanged

### Requirement: Execution authorization is bound to a Plan revision and digest
The system MUST create an internal execution authorization only when `planId`,
`revision`, and `digest` match the current validated PlanRecord. Authorization
MUST record the allowed effect categories and policy source and MUST NOT require
a whole-Plan approval UI.

#### Scenario: Current revision is authorized
- **WHEN** PlanService validates the exact current revision and digest with no pending user-value interaction
- **THEN** the Plan transitions to `approved` and the Main Agent may execute its PlanExecutionSteps under existing permission policy

#### Scenario: Stale authorization is observed
- **WHEN** an authorization refers to an older revision or different digest
- **THEN** the system rejects it and does not start execution

#### Scenario: Authorized plan changes
- **WHEN** any semantic field changes after authorization
- **THEN** the system clears authorization and returns the Plan to internal validation

#### Scenario: Existing tool permission is required
- **WHEN** an authorized PlanExecutionStep invokes a tool covered by the normal permission policy
- **THEN** the system still requests or applies that tool permission independently of internal Plan authorization

### Requirement: Approved effect grants bound actual execution
Each PlanExecutionStep SHALL declare approved effect categories and canonical resource scopes. Every side-effect tool call MUST match the active Plan's revision, digest, step binding, effect category, and normalized resource scope before normal tool permission is evaluated.

#### Scenario: Tool call is within approved scope
- **WHEN** a bound Agent invokes an effect and resource covered by the active PlanExecutionStep
- **THEN** PlanExecutionGuard allows the call to continue to the normal permission policy

#### Scenario: Tool call expands approved scope
- **WHEN** a tool targets an effect category, path, command class, origin, or external resource outside the PlanExecutionStep grants
- **THEN** PlanExecutionGuard blocks the call without executing it and preserves the current Plan authorization and step binding

#### Scenario: Blocked expansion is materially required
- **WHEN** Main determines from execution evidence that a blocked effect or resource is required and the approved path is no longer feasible
- **THEN** Main explicitly reports a material conflict and only then transitions the Plan to `needs_replan`

#### Scenario: Normal permission is broader than Plan approval
- **WHEN** an existing permission rule would allow an effect outside the approved Plan scope
- **THEN** the Plan guard still rejects the tool call

#### Scenario: Read evidence completes beside a running side effect
- **WHEN** a read Tool returns while another authorized side-effect Tool for the same Plan is still in flight
- **THEN** the Host records the read evidence without decrementing the side-effect Tool lifecycle count or completing a pending cancellation

#### Scenario: Command verification is compiled into execution scope
- **WHEN** a PlanExecutionStep declares a command verification
- **THEN** compilation requires one simple shell command, derives its command class into the step's canonical `process` grant, and rejects compound shell syntax that must be split into separate checks

#### Scenario: Grep verification has an option-like pattern
- **WHEN** a `grep` command verification could pass a pattern beginning with `-`
- **THEN** compilation rejects it unless the command uses `--` or `-e/--regexp` to identify the pattern unambiguously

### Requirement: Plan execution, TaskState, and runtime progress remain separate
PlanExecutionStep SHALL describe authorized internal work and structured
verification. Main Agent TaskState SHALL describe user-visible outcome
progress. AgentProcess, Tool, and continuation state SHALL describe runtime
activity. No layer may infer another layer's state solely from matching titles,
array positions, workspace paths, or completion counters.

Newly compiled command verification SHALL separate human-readable description
from machine matching. `expect.exitCode` SHALL be required. `expect.stdout`
SHALL be optional and, when present, SHALL declare `contains`, `equals`, or
`regex` explicitly. Planner MUST NOT create a human verification criterion.

#### Scenario: Plan execution produces progress
- **WHEN** Main completes one or more internal PlanExecutionSteps and produces an observable outcome
- **THEN** Main updates the corresponding outcome in TaskState through a typed context mutation rather than Host projecting execution step status into TODO

#### Scenario: Several outcomes share a workspace
- **WHEN** multiple outcome milestones require edits to the same file or workspace scope
- **THEN** Plan compilation allows the shared scope when every effect remains covered by the authorized Plan

#### Scenario: Tool or SubAgent completes
- **WHEN** a Tool succeeds or a bound SubAgent exits successfully
- **THEN** the system records runtime evidence without directly creating, renaming, completing, or blocking a TodoItem

#### Scenario: Command succeeds without output
- **WHEN** a command verification declares only `expect.exitCode: 0` and the command exits with code zero and empty stdout
- **THEN** Host accepts the verification without comparing stdout to explanatory placeholder text

#### Scenario: Command requires output matching
- **WHEN** a command verification includes an explicit stdout matcher
- **THEN** Host applies only the declared matcher to the persisted stdout and does not interpret the description as an assertion

#### Scenario: Required observation has no execution capability
- **WHEN** Planner proposes browser, screenshot, or another Tool-backed verification but Main has no matching Tool
- **THEN** Plan compilation rejects the draft before authorization and any remaining manual observation is reported after execution without creating a user-operated TODO

#### Scenario: Planner adds human verification
- **WHEN** a proposed PlanExecutionStep contains a human-operated verification
- **THEN** Plan compilation rejects it because user validation is not Agent execution work

#### Scenario: Main submits an invalid compound command
- **WHEN** Main submits a compound Bash command that cannot produce a canonical process scope
- **THEN** Host rejects it as a retryable invalid command, preserves Plan authorization and TaskState, and does not derive a new revision or blocker

#### Scenario: Verification fails but execution can continue
- **WHEN** required command or Tool-backed verification fails and Main still has an approved retry or repair path
- **THEN** the PlanExecutionStep remains incomplete, the active TodoItem remains in progress, and Host does not mark TaskState blocked

#### Scenario: Agent process exits unsuccessfully
- **WHEN** a bound AgentProcess fails, terminates, or is killed
- **THEN** Runtime records the exit and TaskState remains unchanged unless Main or recovery logic identifies a structured external blocker or terminal task failure

### Requirement: Material execution conflicts trigger replanning
Plan semantic intent, TaskState, and execution incidents MUST remain separate. The system SHALL enter `needs_replan` only when the bound Main reports a material conflict against the current revision, digest, and active execution step; identifies an actual hard constraint or selected decision; and cites successful objective Tool evidence persisted for that step. Failed or unknown Tool evidence, permission denial, failed verification, adapter errors, Agent self-report, summary text, TodoItem changes, and continuation exhaustion MUST NOT establish a material conflict or change semantic revision. The explicit user `requestReplan` compatibility API MAY remain an independent path.

#### Scenario: New evidence conflicts with approved path
- **WHEN** execution discovers a dependency that makes the selected path infeasible
- **THEN** the system stops scheduling new PlanExecutionSteps, records the evidence, preserves TaskState, and starts a Planner from the current revision

#### Scenario: Agent attempts an unnecessary diagnostic command
- **WHEN** Main attempts a command outside the current execution step grant but the approved path remains feasible
- **THEN** Host blocks the command, keeps the execution step and TodoItem state unchanged, and does not derive a new revision

#### Scenario: Execution incident is reported as a material conflict
- **WHEN** Main cites failed or unknown Tool evidence, a permission denial, an Agent report, or only a summary
- **THEN** Host rejects `plan_report_conflict`, preserves execution status, semantic revision, digest, authorization, and step binding, and does not start Planner

#### Scenario: Objective evidence proves a material conflict
- **WHEN** the current bound Main cites successful Tool evidence from the current execution step that invalidates an existing hard constraint or selected decision
- **THEN** Host accepts `plan_report_conflict`, transitions to `needs_replan`, and starts Planner after in-flight Tool calls settle

#### Scenario: User explicitly requests replanning
- **WHEN** a compatible client invokes `requestReplan`
- **THEN** Host may enter replanning through that user-request path without fabricating execution evidence

#### Scenario: Replanning derives a new revision
- **WHEN** Planner starts from `needs_replan`
- **THEN** it creates a revision linked through `baseRevision`, retains auditable prior events, and clears the old approval

#### Scenario: In-flight atomic tool is present
- **WHEN** replanning begins while an atomic tool call is already running
- **THEN** the tool follows existing abort-or-settle semantics and its result is recorded only as evidence

### Requirement: User-value interactions are durable and idempotent
The system SHALL persist pending Chat-native intent alignment before notifying
a UI and SHALL identify each interaction with a stable `interactionId` and
payload digest. Internal technical decisions and Plan authorization SHALL NOT
create user interactions. Every mutation command SHALL have a separate stable
`commandId`; handled commands SHALL produce receipts containing optional
interaction identity, payload digest, result, and resulting store version.

#### Scenario: UI disconnects while waiting
- **WHEN** an intent alignment is pending and the UI reconnects
- **THEN** the system re-emits the persisted interaction with the same interactionId

#### Scenario: Client repeats a decision command
- **WHEN** the same commandId and payload digest are delivered more than once
- **THEN** the system applies it at most once and returns the receipt result or current Plan snapshot

#### Scenario: Command ID is reused with different input
- **WHEN** a handled commandId arrives with a different payload digest
- **THEN** the system rejects the command without mutating the Plan

#### Scenario: Interaction completes
- **WHEN** a pending interaction is successfully consumed
- **THEN** PlanStore clears the pending entry, prevents another command from consuming that interactionId, and retains the command receipt for the active lifetime of the Plan

#### Scenario: Terminal Plan exceeds recovery retention
- **WHEN** a completed, cancelled, or failed Plan exceeds the configured recovery TTL
- **THEN** the system archives or deletes the Plan and its receipts together rather than evicting receipts from an active Plan

### Requirement: Cancellation and failure have explicit terminal semantics
The system SHALL support cancellation from drafting, waiting, approved, needs-replan, and executing states. `completed`, `cancelled`, and `failed` SHALL be terminal for the current revision.

#### Scenario: Planning is cancelled before execution
- **WHEN** the user cancels a drafting, waiting, approved, or needs-replan Plan
- **THEN** pending interactions close, Planner exits, Main returns idle, and the original request does not continue

#### Scenario: Execution is cancelled
- **WHEN** the user cancels an executing Plan
- **THEN** the system stops scheduling new PlanExecutionSteps, settles or aborts in-flight tools using existing semantics, records completed effects, and transitions to `cancelled`

#### Scenario: Cancellation waits for every registered tool
- **WHEN** cancellation is accepted while multiple authorized Tool calls are in flight
- **THEN** the Plan remains non-terminal until every registered call has independently settled or released

#### Scenario: Terminal Plan is retried
- **WHEN** the user retries a completed, cancelled, or failed Plan
- **THEN** the system creates a new semantic revision or a new Plan instead of mutating the terminal revision

### Requirement: Completed execution has a separate final report phase
After a Plan commits `completed`, the Host SHALL clear Plan bindings, keep the
owning Main process alive, and enter one in-memory report phase even when Main's
`activePlan` has already been cleared. Execution-phase assistant narration
SHALL remain hidden from live and replayed Chat. Before producing the report,
Main SHALL complete the TaskState outcomes that were actually delivered. It
SHALL then emit exactly one visible final report covering delivered results,
verification actually run and its conclusions, and anything unverified or
still missing. The report phase MUST reject new Plan side effects and MAY allow
only TaskState updates and read-only tools.

#### Scenario: Plan verification completes
- **WHEN** the last PlanExecutionStep commits completed
- **THEN** terminal cleanup clears Main and SubAgent Plan bindings, terminates remaining bound SubAgents, preserves Main, and advances the continuation tracker from execution to report

#### Scenario: TaskState still has delivered active outcomes
- **WHEN** report phase starts before those outcomes are completed
- **THEN** Main first uses legal TaskState transitions, including `pending` through `in_progress`, and records concise completion results

#### Scenario: Main reports completion
- **WHEN** TaskState finalization is complete
- **THEN** Main emits one visible report with delivery, actual verification, and unverified or missing sections, after which the report tracker clears

#### Scenario: Report phase attempts a side effect
- **WHEN** Main calls a non-read Tool other than `task_update` during report phase
- **THEN** Host rejects the Tool call because completed Plan authorization cannot be used for new side effects

#### Scenario: Plan is cancelled or failed
- **WHEN** terminal cleanup handles `cancelled` or `failed`
- **THEN** it retains the existing behavior that terminates Main rather than entering the completed report phase

#### Scenario: Host crashes before the report
- **WHEN** the Plan is already completed but the in-memory report tracker is lost before a visible report is emitted
- **THEN** recovery restores Plan and TaskState terminal data but does not automatically resend the report

### Requirement: Active plans recover conservatively
On startup or Session restore, the system SHALL validate the active PlanRecord and reconcile it with AgentSupervisor before resuming work.

#### Scenario: Awaiting decision is restored
- **WHEN** a valid PlanRecord has status `awaiting_decision`
- **THEN** the system restores or restarts the Planner and re-presents the pending decision without changing revision

#### Scenario: Approved execution has no valid Main binding
- **WHEN** a PlanRecord is `approved` or `executing` but its executing Main process cannot be safely restored
- **THEN** the system transitions the Plan to `needs_replan` and performs no automatic side effect

#### Scenario: Approval coordination is interrupted
- **WHEN** approval commits but Planner completion, Main binding, or execution continuation fails
- **THEN** the system records the coordination failure and retries the idempotent completion path during recovery instead of leaving an unreachable approved Plan

#### Scenario: Main switches Sessions
- **WHEN** the Main Process is rebound from one Session to another
- **THEN** the Host clears the previous Session's active Plan, step binding, and TaskState before persistence and restores only the Plan and Main AgentContext validated for the target Session

#### Scenario: Stored digest is invalid
- **WHEN** the persisted semantic fields do not match the stored digest
- **THEN** the system marks the Plan failed or quarantined and refuses approval or execution

### Requirement: Plan persistence excludes private reasoning
PlanStore, Harness events, WebSocket payloads, and UI projections MUST contain only public decision summaries and MUST NOT contain hidden prompts or model Chain-of-Thought.

#### Scenario: Planner evaluates candidates
- **WHEN** the model internally reasons about alternatives
- **THEN** only candidate summaries, cited evidence, trade-offs, recommendation, and chosen outcome are persisted

#### Scenario: Plan is displayed
- **WHEN** Web or TUI renders an internally authorized PlanRecord
- **THEN** a deterministic public projection shows its goal, committed user constraints, selected decision summaries, scope, ordered execution steps, and verification approach while excluding alternatives, evidence identifiers, internal metadata, hidden prompts, raw model reasoning, and TaskState
