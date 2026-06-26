## ADDED Requirements

### Requirement: Artifact streaming events
The ServerEvent type SHALL include `artifact_start`, `artifact_delta` (with a `delta: string` field), and `artifact_end` event types for streaming LLM-generated HTML content to the client.

#### Scenario: artifact_start event
- **WHEN** the server initiates artifact generation
- **THEN** it sends `{ "type": "artifact_start" }`

#### Scenario: artifact_delta event
- **WHEN** the LLM produces a chunk of HTML during artifact generation
- **THEN** it sends `{ "type": "artifact_delta", "delta": "<div class=\"chart\">" }`

#### Scenario: artifact_end event
- **WHEN** the LLM completes artifact generation
- **THEN** it sends `{ "type": "artifact_end" }`

### Requirement: Artifact client command
The ClientCommand type SHALL include an `artifact` command with fields: `action: "generate" | "update"`, optional `context: string` (for generate), and optional `instruction: string` (for update).

#### Scenario: artifact generate command
- **WHEN** the client sends `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }`
- **THEN** the server processes it as an artifact generation request

#### Scenario: artifact update command
- **WHEN** the client sends `{ "type": "artifact", "action": "update", "instruction": "make the charts bigger" }`
- **THEN** the server processes it as an artifact modification request
