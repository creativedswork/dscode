## ADDED Requirements

### Requirement: HarnessEvent includes presentation-neutral Plan events
The HarnessEvent discriminated union SHALL include typed events for route decisions, Plan snapshots, pending user-value interactions, internal authorization changes, execution changes, and revision conflicts.

#### Scenario: Auto routing completes
- **WHEN** the Host computes a Direct or Plan route
- **THEN** it emits `plan:route` with request identity, dimension scores, decision, and public evidence summary

#### Scenario: Plan snapshot is committed
- **WHEN** PlanStore commits any new store version, including approval, status, evidence, interaction, or receipt-only updates
- **THEN** PlanService emits `plan:updated` with the immutable committed snapshot

#### Scenario: Human input is required
- **WHEN** a persisted intent-alignment interaction becomes pending
- **THEN** PlanService emits `plan:interaction` with interactionId, planId, revision, one concise question, an optional recommendation, and public user-value options

#### Scenario: Revision conflict occurs
- **WHEN** a Plan command fails compare-and-swap validation
- **THEN** PlanService emits `plan:conflict` with the expected version, current version, semantic revision, and current snapshot

### Requirement: Plan events exclude presentation and private reasoning
Plan events MUST NOT contain JSX, terminal formatting, localized button labels, hidden prompts, or model Chain-of-Thought.

#### Scenario: Web and TUI receive the same alignment
- **WHEN** an intent-alignment event is emitted
- **THEN** both adapters receive the same domain payload and independently choose their presentation

#### Scenario: Planner produces private reasoning
- **WHEN** the Planner evaluates candidates internally
- **THEN** no technical candidate tree or private reasoning is emitted to presentation adapters

### Requirement: Plan events follow commit ordering
Events representing persisted Plan state SHALL be emitted only after a successful atomic commit and SHALL identify the committed store version and semantic revision.

#### Scenario: Commit succeeds
- **WHEN** PlanStore atomically commits store version `N`
- **THEN** the corresponding Plan event carries version `N`, the current semantic revision, and a snapshot observers can immediately read

#### Scenario: Commit fails
- **WHEN** serialization, CAS, or atomic rename fails
- **THEN** no event claims that the uncommitted revision became authoritative
