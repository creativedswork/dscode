## MODIFIED Requirements

### Requirement: /eval Slash Command

The system SHALL provide `/eval [session_id]` to analyze a target Session with the unified CHIEF Multi-Agent Pipeline and generate a self-contained diagnostic Dashboard. Without an argument it SHALL evaluate a frozen snapshot of the current Session; with an exact ID or valid prefix it SHALL load the persisted target Session.

The command SHALL:

1. Resolve and freeze the target Session before spawning workers.
2. Load only target task SubAgents indexed by `agentMessages`.
3. Prepare a run-isolated workspace and Multi-Agent Trajectory.
4. Execute all LLM stages through process-only AgentSupervisor workers.
5. Generate the Dashboard only after required stages pass validation.
6. Preserve the latest successful Dashboard if the new run fails.
7. Publish typed starting/running/completed/failed Eval Dashboard lifecycle events.
8. Delegate final presentation to the active UI backend through shared Harness events.

During execution, phase boundaries SHALL be reported through UI info/progress events, workers SHALL appear through shared Agent Activity, and Eval Dashboard lifecycle events SHALL carry run/target identity. Errors SHALL be written to the eval Logger with run/stage context and surfaced concisely to the user.

After success, TUI SHALL open the compatibility Dashboard file in the system browser. WebUI SHALL render the exact generated HTML in its dedicated Eval view and SHALL NOT automatically open an additional external browser window.

#### Scenario: WebUI command immediately enters Eval mode

- **WHEN** WebUI submits `/eval` through its prompt
- **THEN** the slash-command path SHALL publish `starting` before the first asynchronous target load
- **AND** WebUI SHALL switch to its Eval preparation view immediately
- **AND** subsequent CHIEF progress SHALL update that view instead of behaving as command-line-only text output

#### Scenario: Evaluate current Multi-Agent Session from TUI

- **WHEN** the user runs `/eval` in TUI and the current Session has three task SubAgents
- **THEN** the command SHALL analyze Main and all three indexed SubAgents
- **AND** SHALL run CHIEF workers through AgentSupervisor
- **AND** SHALL generate `~/.dscode/eval/<session-prefix>.html`
- **AND** TUI SHALL open the completed Dashboard in the system browser

#### Scenario: Evaluate current Multi-Agent Session from WebUI

- **WHEN** the user runs `/eval` in WebUI and the current Session has task SubAgents
- **THEN** the command SHALL generate the same run-local and compatibility HTML files
- **AND** WebUI SHALL receive the completed HTML through a typed Eval Dashboard event
- **AND** WebUI SHALL render the report in its Eval view
- **AND** the server SHALL NOT automatically open an additional external browser window

#### Scenario: Evaluate historical Session

- **WHEN** Session B is current and the user runs `/eval A`
- **THEN** target data SHALL come from persisted Session A
- **AND** live worker activity SHALL be routed to B
- **AND** Eval Dashboard events SHALL identify A as the target
- **AND** neither A nor B SHALL receive process-only worker summaries in `agentMessages`

#### Scenario: Session not found

- **WHEN** the provided Session ID or prefix cannot be resolved
- **THEN** the UI SHALL display `Session not found: <id>`
- **AND** no eval worker SHALL spawn
- **AND** no Dashboard SHALL be generated

#### Scenario: No current Session

- **WHEN** `/eval` has no argument and no current Session exists
- **THEN** the UI SHALL display `No session to evaluate. Usage: /eval [session_id]`

#### Scenario: Worker stage fails

- **WHEN** a required CHIEF stage fails after its validation retry
- **THEN** the UI SHALL identify the failed stage
- **AND** a failed Eval Dashboard event SHALL include the run/target identity and escaped error summary
- **AND** the run manifest/log SHALL retain diagnostics
- **AND** the latest successful Dashboard for the same target Session SHALL not be overwritten or presented as the failed run
- **AND** a Dashboard from another target Session SHALL NOT be used as failure fallback
