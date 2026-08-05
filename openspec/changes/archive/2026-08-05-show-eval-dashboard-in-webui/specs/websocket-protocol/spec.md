## ADDED Requirements

### Requirement: Typed Eval Dashboard lifecycle event

The shared `ServerEvent` protocol SHALL define an `eval_dashboard` event whose payload is a discriminated union over `status: "starting" | "running" | "completed" | "failed"`. A starting event SHALL carry the optional requested Session ID because canonical target/run identity may not yet exist. Running/completed/failed events associated with a created run SHALL carry canonical `targetSessionId` and `runId`.

Running events SHALL carry CHIEF stage, stage index/total, Application and optional worker Agent ID. Completed events SHALL carry the complete self-contained HTML and generation timestamp. Failed events SHALL carry an escaped error summary and optional failed stage.

#### Scenario: Starting Eval event

- **WHEN** the WebUI slash-command handler recognizes `/eval` or `/eval <session-id>`
- **THEN** the server SHALL send `{ type: "eval_dashboard", status: "starting", requestedSessionId? }`
- **AND** SHALL send it before awaiting Session loading or CHIEF execution
- **AND** the payload SHALL NOT invent `targetSessionId` or `runId`

#### Scenario: Running Eval event

- **WHEN** the CHIEF backtrack stage starts with a worker Agent
- **THEN** the server SHALL send an event equivalent to `{ type: "eval_dashboard", status: "running", targetSessionId, runId, stage: "backtrack", index: 4, total: 7, application: "chief-backtrack", workerAgentId }`

#### Scenario: Completed Eval event

- **WHEN** the coordinator has atomically written and validated the completed Dashboard
- **THEN** the server SHALL send `{ type: "eval_dashboard", status: "completed", targetSessionId, runId, html, generatedAt }`
- **AND** `html` SHALL be the exact generated self-contained report

#### Scenario: Failed Eval event

- **WHEN** a required CHIEF stage fails after retry
- **THEN** the server SHALL send `{ type: "eval_dashboard", status: "failed", targetSessionId, runId, stage, error }`
- **AND** SHALL NOT include partial HTML as a completed report

### Requirement: Eval Dashboard events are server-authoritative

The client SHALL NOT provide filesystem paths or arbitrary HTML through an Eval Dashboard command. Eval Dashboard events SHALL only originate from the server-side `/eval` coordinator for a run it created.

#### Scenario: Client cannot request arbitrary Eval path

- **WHEN** a client sends a payload containing a local file path while attempting to open an Eval report
- **THEN** the protocol SHALL NOT interpret that path as an Eval Dashboard source
- **AND** the backend SHALL NOT read or serve the requested arbitrary path

#### Scenario: External open uses received HTML

- **WHEN** WebUI opens a completed Eval report outside the embedded view
- **THEN** it SHALL use the HTML already received in the completed event
- **AND** no additional server filesystem command SHALL be required
