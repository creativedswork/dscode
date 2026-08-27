## ADDED Requirements

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
- **WHEN** the assessment has no intent uncertainty, impact, risk, or coordination dimension at level `2` and its total score is less than `4`
- **THEN** the system records a Direct route decision and allows the Main Agent to continue without starting a Planner

#### Scenario: Complex request enters Plan Mode
- **WHEN** intent uncertainty, impact, risk, or coordination is level `2`, or the total complexity score is at least `4`
- **THEN** the system blocks the pending side effect and transfers foreground control to a Planner process

#### Scenario: Mutation is attempted without an assessment
- **WHEN** an Auto request reaches a mutating tool without a valid route decision
- **THEN** the execution guard rejects the mutation and requires a route assessment

#### Scenario: Assessment and mutation share one tool-call batch
- **WHEN** one model response requests a route assessment and a mutating tool concurrently
- **THEN** the system commits only the assessment result and requires any Direct mutation to be requested again after the route decision is active

### Requirement: Complexity assessment is structured and auditable
The assessment SHALL score intent uncertainty, alternative divergence, impact radius, operational risk, and coordination complexity from `0` through `2`, and SHALL include concise evidence summaries without private reasoning.

#### Scenario: Assessment is accepted
- **WHEN** all five dimensions, supporting evidence, and request identity are present
- **THEN** the Host computes the route using the deterministic policy

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
- **THEN** the Planner exits and Supervisor returns foreground control to the Main Agent

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
whole-Plan approval SHALL remain internal.

#### Scenario: Equivalent implementation detail
- **WHEN** candidate differences do not affect user-visible trade-offs or hard constraints
- **THEN** the Planner resolves the detail without interrupting the user and records a summary

#### Scenario: Choice changes compatibility
- **WHEN** viable candidates preserve different user-visible compatibility guarantees that were not specified
- **THEN** the Planner pauses and asks one Chat-native alignment question

### Requirement: PlanRecord is the persistent source of truth
The system SHALL persist each complex task as a project-scoped PlanRecord independent of Session transcript and Agent runtime state.

#### Scenario: Plan is created
- **WHEN** a request enters Plan Mode
- **THEN** PlanStore atomically persists a record containing plan identity, request identity, goal, constraints, status, version, revision, digest, decisions, items with effect grants, pending interaction, command receipts, trajectory events, and timestamps

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
- **WHEN** selection, constraints, execution items, acceptance criteria, or side effects change
- **THEN** version and revision each increment and digest is recomputed

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
The system SHALL compute a deterministic digest over the goal, constraints, selected decisions, immutable PlanItem definitions, acceptance criteria, effect grants, and side-effect summary. Mutable item status, evidence, execution binding, approval, runtime progress, telemetry, and non-semantic timestamps MUST NOT affect the digest.

#### Scenario: Semantic plan content changes
- **WHEN** a selected path, constraint, immutable execution item definition, acceptance criterion, effect grant, or side-effect summary changes
- **THEN** the resulting revision has a different digest

#### Scenario: Agent progress changes
- **WHEN** only item status, evidence, execution binding, approval, Agent progress, or timing telemetry changes
- **THEN** the Plan digest remains unchanged

### Requirement: Execution authorization is bound to a Plan revision and digest
The system MUST create an internal execution authorization only when `planId`,
`revision`, and `digest` match the current validated PlanRecord. Authorization
MUST record the allowed effect categories and policy source and MUST NOT require
a whole-Plan approval UI.

#### Scenario: Current revision is authorized
- **WHEN** PlanService validates the exact current revision and digest with no pending user-value interaction
- **THEN** the Plan transitions to `approved` and the Main Agent may execute its items under existing permission policy

#### Scenario: Stale authorization is observed
- **WHEN** an authorization refers to an older revision or different digest
- **THEN** the system rejects it and does not start execution

#### Scenario: Authorized plan changes
- **WHEN** any semantic field changes after authorization
- **THEN** the system clears authorization and returns the Plan to internal validation

#### Scenario: Existing tool permission is required
- **WHEN** an authorized PlanItem invokes a tool covered by the normal permission policy
- **THEN** the system still requests or applies that tool permission independently of internal Plan authorization

### Requirement: Approved effect grants bound actual execution
Each PlanItem SHALL declare approved effect categories and canonical resource scopes. Every side-effect tool call MUST match the active Plan's revision, digest, item binding, effect category, and normalized resource scope before normal tool permission is evaluated.

#### Scenario: Tool call is within approved scope
- **WHEN** a bound Agent invokes an effect and resource covered by the in-progress PlanItem
- **THEN** PlanExecutionGuard allows the call to continue to the normal permission policy

#### Scenario: Tool call expands approved scope
- **WHEN** a tool targets an effect category, path, command class, origin, or external resource outside the PlanItem grants
- **THEN** PlanExecutionGuard blocks the call, records the attempted expansion, and transitions the Plan to `needs_replan`

#### Scenario: Normal permission is broader than Plan approval
- **WHEN** an existing permission rule would allow an effect outside the approved Plan scope
- **THEN** the Plan guard still rejects the tool call

### Requirement: Plan status and execution progress remain separate
PlanItem status MUST represent acceptance progress, while AgentProcess and tool events MUST represent objective runtime progress. Agent or SubAgent completion MUST be treated as evidence only.

#### Scenario: SubAgent completes assigned work
- **WHEN** a bound SubAgent exits successfully
- **THEN** the system attaches its result as evidence and leaves the PlanItem incomplete until acceptance criteria pass

#### Scenario: Acceptance criteria pass
- **WHEN** the bound Main Agent submits `verify_item` with evidence for every command and observable criterion
- **THEN** PlanService validates caller identity and evidence before marking that PlanItem `completed`

#### Scenario: Human acceptance is required
- **WHEN** an item contains a human acceptance criterion
- **THEN** `verify_item` must reference a consumed human-interaction receipt for that criterion

#### Scenario: SubAgent attempts self-verification
- **WHEN** a SubAgent submits `verify_item` for its own result
- **THEN** PlanService rejects the command and retains the current PlanItem status

#### Scenario: Agent fails
- **WHEN** a bound AgentProcess fails
- **THEN** the PlanItem becomes `blocked` or triggers replanning according to the evidence, rather than being marked completed

### Requirement: Material execution conflicts trigger replanning
The system SHALL enter `needs_replan` when new evidence invalidates feasibility, violates a hard constraint, or materially changes approved side effects.

#### Scenario: New evidence conflicts with approved path
- **WHEN** execution discovers a dependency that makes the selected path infeasible
- **THEN** the system stops scheduling new PlanItems, records the evidence, and starts a Planner from the current revision

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
- **THEN** the system stops scheduling new items, settles or aborts in-flight tools using existing semantics, records completed effects, and transitions to `cancelled`

#### Scenario: Terminal Plan is retried
- **WHEN** the user retries a completed, cancelled, or failed Plan
- **THEN** the system creates a new semantic revision or a new Plan instead of mutating the terminal revision

### Requirement: Active plans recover conservatively
On startup or Session restore, the system SHALL validate the active PlanRecord and reconcile it with AgentSupervisor before resuming work.

#### Scenario: Awaiting decision is restored
- **WHEN** a valid PlanRecord has status `awaiting_decision`
- **THEN** the system restores or restarts the Planner and re-presents the pending decision without changing revision

#### Scenario: Approved execution has no valid Main binding
- **WHEN** a PlanRecord is `approved` or `executing` but its executing Main process cannot be safely restored
- **THEN** the system transitions the Plan to `needs_replan` and performs no automatic side effect

#### Scenario: Stored digest is invalid
- **WHEN** the persisted semantic fields do not match the stored digest
- **THEN** the system marks the Plan failed or quarantined and refuses approval or execution

### Requirement: Plan persistence excludes private reasoning
PlanStore, Harness events, WebSocket payloads, and UI projections MUST contain only public decision summaries and MUST NOT contain hidden prompts or model Chain-of-Thought.

#### Scenario: Planner evaluates candidates
- **WHEN** the model internally reasons about alternatives
- **THEN** only candidate summaries, cited evidence, trade-offs, recommendation, and chosen outcome are persisted

#### Scenario: Plan is displayed
- **WHEN** Web or TUI renders a PlanRecord
- **THEN** the user sees auditable decisions and evidence rather than raw model reasoning
