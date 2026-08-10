## Purpose

Session data layer types — ImageRef, generic AgentSessionMessage, session metadata, and display model.
## Requirements
### Requirement: ImageRef Type Definition
The system SHALL define `ImageRef` in the resource module that owns cached image
identity. Session SHALL import the owner-defined contract rather than a UI or
pipeline implementation type.

#### Scenario: ImageRef structure
- **WHEN** a session message contains an image reference
- **THEN** it SHALL use `{ type: "image_ref", hash: string, mimeType: string }`
- **AND** `hash` SHALL be the cache filename (e.g. "a1b2c3d4e5f6a7b8.jpg")
- **AND** `mimeType` SHALL be the MIME type (e.g. "image/jpeg")

### Requirement: SubAgent Message Log
The system SHALL record child Agent executions in a presentation-neutral
`agentMessages` array within the parent Session. Full child transcripts SHALL
remain in AgentProcessStore and SHALL NOT enter Main Agent messages.

#### Scenario: Vision Agent log structure
- **WHEN** a Vision Agent exits
- **THEN** the parent session SHALL contain an `AgentSessionMessage` with:
  - `role: "subagent"`
  - the child `agentId`, `parentAgentId`, Application name, and exit state
  - generic input prompt and attachments
  - output text, source, and error
  - process timestamps
  - optional `messageIndex` linking the execution to a Main Agent message

#### Scenario: Legacy VisionMessage migration
- **WHEN** a version 2 session containing `visionMessages` is loaded
- **THEN** the system SHALL expose those entries as generic `AgentSessionMessage` records
- **AND** the next save SHALL write version 3 `agentMessages` without `visionMessages`

### Requirement: Session data model has no Presentation dependency

Session types, stores, managers, and migrations MUST NOT import from `src/ui/`.
They SHALL return domain snapshots that Presentation can project.

#### Scenario: Architecture dependencies are checked

- **WHEN** Session production code imports a UI model or formatter
- **THEN** architecture verification SHALL fail

#### Scenario: Session replay is requested

- **WHEN** TUI or Web loads a Session
- **THEN** HarnessAPI SHALL return a presentation-neutral snapshot
- **AND** the selected adapter SHALL project it into canonical conversation state

### Requirement: Image Recovery on Session Load
The system SHALL attempt to recover images when loading a session by reading from the image cache via `ImagePipeline`'s internal `ImageCache`.

#### Scenario: Cache hit on load
- **WHEN** a session message has `ImageRef` entries
- **AND** the corresponding cache files exist
- **THEN** the system SHALL read the image data from cache
- **AND** reconstruct the message with inline base64 images for the agent/frontend

#### Scenario: Cache miss on load
- **WHEN** a session message has `ImageRef` entries
- **AND** the corresponding cache files do NOT exist
- **THEN** the system SHALL NOT crash or error
- **AND** SHALL show a placeholder indicator for missing images
