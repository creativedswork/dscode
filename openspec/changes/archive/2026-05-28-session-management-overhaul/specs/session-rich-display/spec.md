## ADDED Requirements

### Requirement: Session list displays rich metadata
The `/session list` command SHALL display for each session: a short ID prefix, title (quoted, truncated to 60 chars), model provider and ID, last activity date and time, and message count.

#### Scenario: List shows sessions with full metadata
- **WHEN** user runs `/session list` in a project with saved sessions
- **THEN** each session line shows: `id[:8]`, title in quotes, `provider/modelId`, date `YYYY-MM-DD`, time `HH:MM`, and `N msgs`

#### Scenario: List shows project path in header
- **WHEN** user runs `/session list`
- **THEN** the output header includes the current project path

#### Scenario: List shows empty state message
- **WHEN** user runs `/session list` in a project with no sessions
- **THEN** the system displays "No sessions in this project. Start a conversation to create one."

### Requirement: Session load displays detailed confirmation
The `/session load <id>` command SHALL display after loading: session ID, title, model provider and ID, project path, creation time, last activity time, and message count.

#### Scenario: Load displays full session details
- **WHEN** user runs `/session load 01a2b3c4`
- **THEN** the output includes: session ID, title, model (provider + modelId), project path, creation timestamp, last activity timestamp, and message count

#### Scenario: Load with partial ID prefix works
- **WHEN** user runs `/session load 01a2` and exactly one session ID starts with `01a2`
- **THEN** that session is loaded and its details are displayed

#### Scenario: Load with ambiguous prefix reports error
- **WHEN** user runs `/session load 01` and multiple session IDs start with `01`
- **THEN** the system reports "Ambiguous session ID prefix. Matching sessions:" followed by the list of matching sessions

### Requirement: Session metadata includes content preview
The `SessionMetadata` type SHALL include a `preview` field containing the first 80 characters of the first user message, computed at save time.

#### Scenario: Preview is extracted from first user message
- **WHEN** a session is saved with at least one user message
- **THEN** `metadata.preview` is set to the first 80 characters of that message's text content

#### Scenario: Preview is empty for sessions with no user messages
- **WHEN** a session is saved with no user messages
- **THEN** `metadata.preview` is an empty string

#### Scenario: Session list includes preview in detailed view
- **WHEN** user runs `/session list --verbose` (or web UI lists sessions)
- **THEN** each session entry includes the preview snippet

### Requirement: Web UI session list includes rich metadata
The web UI session list SHALL display: title, preview snippet, model provider and ID, last activity timestamp, and message count.

#### Scenario: Web session list sends enriched SessionInfo
- **WHEN** the web frontend requests session list
- **THEN** the server sends `SessionInfo` objects with fields: `id`, `title`, `preview`, `modelProvider`, `modelId`, `projectPath`, `createdAt`, `updatedAt`, `messageCount`
