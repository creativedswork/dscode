## MODIFIED Requirements

### Requirement: Phase Progress Tracking

The system SHALL track the unified CHIEF phases and emit structured events for:

1. Prepare trajectory and workspace
2. Construct hierarchical causal graph
3. Synthesize Virtual Oracles
4. Backtrack Subtask → Agent → Step candidates
5. Perform counterfactual attribution
6. Attribute and merge Harness Rules
7. Generate Dashboard

Each phase event SHALL contain eval run ID, target Session ID, phase name, status, duration when complete, and worker Agent ID/Application when the phase uses a worker.

#### Scenario: Worker-backed phase lifecycle

- **WHEN** Oracle synthesis starts
- **THEN** the system SHALL emit the phase as `running`
- **AND** SHALL identify the spawned `chief-oracle` Agent
- **AND** on exit SHALL emit `done` with duration or `failed` with a diagnostic

#### Scenario: Deterministic phase lifecycle

- **WHEN** trajectory preparation completes without an Agent worker
- **THEN** the phase SHALL emit `done`
- **AND** SHALL report actor count, Step count, and transcript completeness

### Requirement: Web Progress Rendering

Web and TUI SHALL surface CHIEF workers through the shared Agent Activity model and SHALL surface phase boundaries through existing info/progress events. UI adapters SHALL not reconstruct worker state from eval-specific logs.

Progress labels SHALL use the official name `CHIEF` and SHALL display worker Application plus 6-character Agent ID when available.

#### Scenario: Web worker progress

- **WHEN** a `chief-backtrack` worker is running in the visible Session
- **THEN** Web UI SHALL render its standard Agent Activity
- **AND** SHALL show the CHIEF backtracking phase as running

#### Scenario: Historical target routing

- **WHEN** Session B invokes `/eval A`
- **THEN** progress SHALL appear in B
- **AND** SHALL identify A as the target Session
- **AND** loading A SHALL not show process-only eval workers as historical task Agents

### Requirement: Completion Summary

After all phases complete, the system SHALL display target Session, total duration, CHIEF worker process count, total worker model usage when available, actor/transcript counts, and the root-cause Application, short Agent ID, and Step or Agent-level granularity.

#### Scenario: Step-level completion

- **WHEN** attribution selects Explorer `agent-8f31ad...` at Step 18
- **THEN** the summary SHALL identify `Explorer (8f31ad) @ Step 18`
- **AND** SHALL include attribution confidence
- **AND** SHALL then open the Dashboard

#### Scenario: Partial-evidence completion

- **WHEN** attribution can only identify a summary-only Vision Agent
- **THEN** the summary SHALL identify Vision with Agent-level granularity
- **AND** SHALL warn that the internal Step is unavailable

### Requirement: File-Based Progress Logging

CHIEF phase and worker lifecycle events SHALL be written through the eval `Logger`. Log entries SHALL contain eval run ID, target Session ID, phase, worker Agent ID when present, status, duration, and validation retry count.

Routine successful Agent tool activity SHALL remain available through Process records and SHALL not flood the TUI info stream.

#### Scenario: Phase start logged

- **WHEN** graph construction starts with worker X
- **THEN** the logger SHALL record run ID, target Session, `graph`, X's Agent ID, and `running`

#### Scenario: Validation retry logged

- **WHEN** a worker output fails Schema validation and a retry process starts
- **THEN** the logger SHALL record the validation error and retry count
- **AND** the user SHALL receive a concise phase update without the full stack trace

#### Scenario: Completion logged

- **WHEN** CHIEF completes successfully
- **THEN** the logger SHALL record total duration, worker count, evidence completeness, and root-cause Actor
