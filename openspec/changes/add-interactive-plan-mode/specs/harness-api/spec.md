## ADDED Requirements

### Requirement: HarnessAPI exposes a typed Plan port
HarnessAPI SHALL expose typed operations to read the active Plan, submit user-value constraints, perform internal authorization, verify items, request replanning, and cancel. Every mutation SHALL return a `PlanMutationResult` union with explicit success, conflict, invalid-transition, and invalid-command variants. Presentation adapters MUST NOT mutate PlanStore directly.

#### Scenario: Runtime reads an active Plan
- **WHEN** an internal runtime adapter requests the active Plan for a Session
- **THEN** HarnessAPI returns the current immutable Plan snapshot or `undefined` without requiring presentation adapters to display it

#### Scenario: Chat submits an alignment response
- **WHEN** an adapter submits `planId`, `expectedVersion`, `commandId`, `interactionId`, and a selected or custom user-value constraint
- **THEN** HarnessAPI delegates the command to PlanService and returns the committed snapshot

#### Scenario: UI submits stale input
- **WHEN** PlanService rejects a command because its expected version is stale
- **THEN** HarnessAPI returns a typed conflict containing the current version and snapshot without casting through `any`

#### Scenario: UI submits an invalid transition
- **WHEN** a typed command is structurally valid but illegal for the current Plan status
- **THEN** HarnessAPI returns the `invalid_transition` result variant without throwing an untyped error

#### Scenario: Main verifies a PlanItem
- **WHEN** the bound Main Agent submits item identity, expectedVersion, commandId, acceptance results, and evidence references
- **THEN** HarnessAPI delegates to PlanService with the caller Agent identity preserved

### Requirement: UserInteractionPort supports durable intent alignment
UserInteractionPort SHALL support Chat-native user-value alignment in addition
to tool permission requests. PlanService MUST persist the pending interaction
before invoking the port. Technical decisions and internal Plan authorization
MUST NOT be delegated to presentation adapters.

#### Scenario: Planner requests user-value alignment
- **WHEN** a decision node requires a visual, scope, compatibility, cost, or reversibility preference that cannot be inferred
- **THEN** `requestIntentAlignment` receives the persisted interaction identity, one concise question, an optional recommendation, at most three user-understandable options, and a custom-input path

#### Scenario: Planner resolves a technical decision
- **WHEN** candidate differences do not change a user-visible outcome or explicit product constraint
- **THEN** the Planner resolves the decision without invoking UserInteractionPort

#### Scenario: Adapter reconnects
- **WHEN** an in-memory interaction resolver was lost but the pending interaction remains persisted
- **THEN** Harness reissues the request through the newly attached UserInteractionPort

### Requirement: HarnessAPI preserves domain ownership of Plan state
HarnessAPI SHALL return read-only Plan snapshots and SHALL route every mutation through PlanService validation, CAS, and event emission.

#### Scenario: Presentation attempts an invalid transition
- **WHEN** a client answers an interaction that is no longer pending
- **THEN** PlanService rejects the operation and no Plan file is modified

#### Scenario: Plan mutation succeeds
- **WHEN** a command passes lifecycle, revision, and digest validation
- **THEN** PlanService commits once and HarnessAPI exposes the resulting snapshot
