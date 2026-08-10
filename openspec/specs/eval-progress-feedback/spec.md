# eval-progress-feedback Specification

## Purpose

Expose one consistent CHIEF evaluation lifecycle to TUI and Web consumers
without terminal-only output.

## Requirements

### Requirement: CHIEF stage progress uses one event contract

`runEval` SHALL execute the Supervisor-backed CHIEF pipeline and report
`prepare`, `graph`, `oracle`, `backtrack`, `attribution`, `rules`, and
`dashboard` stages through `ChiefProgressEvent`.

#### Scenario: Stage starts and completes

- **WHEN** a CHIEF stage starts
- **THEN** `runEval` SHALL publish an `eval:dashboard` running state
- **AND** SHALL send a concise stage message through `EvalPresenter.addInfo`
- **WHEN** the stage completes
- **THEN** it SHALL report `done` with duration and worker identity when present

### Requirement: Pipeline owns stage lifecycle persistence

The CHIEF pipeline SHALL be the only writer of stage status, worker identity,
retry count, output, and failure details in the Eval run manifest.
The structured Agent runner SHALL only spawn, retry, parse, and validate worker
output.

#### Scenario: Structured output retry fails

- **WHEN** a CHIEF worker produces invalid structured output twice
- **THEN** the runner SHALL return a structured failure to the pipeline
- **AND** the pipeline SHALL persist the stage as `failed`

### Requirement: Evaluation failures are logged and presented

`runEval` SHALL write the failure message and available stack to the Host
Logger, finish an active Eval run as failed, publish an `eval:dashboard` failed
state, and show a concise error through `EvalPresenter.addError`.

#### Scenario: Pipeline crash

- **WHEN** any CHIEF stage throws
- **THEN** the active run SHALL be finished as failed
- **AND** the logger SHALL receive the error and stack when available
- **AND** TUI and Web consumers SHALL receive the same failed state
