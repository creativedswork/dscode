# eval-dashboard Delta Specification

## MODIFIED Requirements

### Requirement: /eval Slash Command

The system SHALL provide a `/eval` slash command that analyzes a session and generates an HTML diagnostic dashboard. Analysis uses a CHIFF multi-step causal graph architecture: 4 LLM calls build a causal graph (subtask decomposition → subtask edges → agent OTAR nodes → agent edges), then 2 LLM calls perform counterfactual attribution (candidate set → root cause via Rule1/2/3/4), followed by 2 deterministic steps (rule abstraction → rule dedup and merge). Rule engine (metadata, stats, timeline) always runs first as Step 0. If any LLM call fails, the system falls back to pure rule-engine analysis and marks the dashboard with "规则引擎分析（LLM 不可用）".

**ADDED**: During pipeline execution, the system SHALL output progress messages via `ui.addInfo`:
- Causal graph pipeline: one Phase-style message per step ("🔍 Phase N/6: ..." / "✓ Phase N/6 完成")
- Focus pipeline: Phase boundaries ("⏳ Phase N/4: ..." / "✓ ...") and throttled agent tool call progress ("  ⟳ ...")
- Final result summary with dashboard path, analysis mode, and stats

**ADDED**: On pipeline crash, the system SHALL write full error details (message + stack trace) to `~/.dscode/logs/eval.log` via `logEval("error", ...)` in addition to the existing `ui.addError` display.

When invoked without arguments, it SHALL analyze the current session. When invoked with a session ID or prefix (minimum 8 characters), it SHALL locate and analyze that session.

#### Scenario: Evaluate current session

- **WHEN** the user types `/eval` with no arguments and a current session exists
- **THEN** the system SHALL analyze the current session's data using the CHIFF pipeline with rule-engine fallback
- **AND** generate an HTML dashboard at `~/.dscode/eval/{session_id_prefix}.html`
- **AND** automatically open the dashboard in the default browser
- **AND** display an info message with the dashboard file path and analysis mode

#### Scenario: Causal graph pipeline shows phase progress

- **WHEN** session has < 500 steps and causal graph pipeline runs
- **THEN** the system SHALL output "🔍 Phase 1/6: 分解子任务..." through "✓ Phase 6/6 完成" as info messages
- **AND** each message SHALL appear before/after its corresponding LLM call

#### Scenario: Focus pipeline shows phase and tool progress

- **WHEN** session has ≥ 500 steps and focus pipeline runs
- **THEN** the system SHALL output phase boundary messages ("🔍 SCAN: 正在扫描...", "✓ ...")
- **AND** SHALL output throttled tool call progress during agent loops ("  ⟳ <tool action>")

#### Scenario: Pipeline crash logged to eval.log

- **WHEN** any pipeline step throws an error
- **THEN** `logEval("error", "Pipeline", "crash: ...")` SHALL be called
- **AND** if stack trace exists, `logEval("error", "Pipeline", "stack:\n...")` SHALL be called
- **AND** `ui.addError(...)` SHALL still display the error message in TUI

#### Scenario: Evaluate session by full ID

- **WHEN** the user types `/eval 00MPX37L8RW7I64DNM725JX5MK` (a valid full session ID)
- **THEN** the system SHALL locate the session file by exact ID match
- **AND** analyze it and generate the dashboard

#### Scenario: Evaluate session by prefix

- **WHEN** the user types `/eval 00MPX37L8` (at least 8 characters matching a session ID prefix)
- **THEN** the system SHALL match the session by prefix
- **AND** analyze it and generate the dashboard

#### Scenario: Session not found

- **WHEN** the user types `/eval` with an invalid or non-existent session ID
- **THEN** the system SHALL display an error message: "Session not found: {id}"
- **AND** NOT generate any dashboard file

#### Scenario: No current session and no argument

- **WHEN** the user types `/eval` with no arguments and there is no current session
- **THEN** the system SHALL display an error message: "No session to evaluate. Usage: /eval [session_id]"
