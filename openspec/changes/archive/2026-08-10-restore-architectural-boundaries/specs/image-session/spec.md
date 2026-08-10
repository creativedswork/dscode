## MODIFIED Requirements

### Requirement: ImageRef Type Definition
The system SHALL define `ImageRef` in the module that owns cached image identity and
retrieval. Session and Agent Runtime MAY reference that owner-defined type, while
Presentation SHALL project it into inline or placeholder display data. Core and UI
MUST NOT define duplicate ImageRef contracts.

#### Scenario: Session message references an image
- **WHEN** a persisted message contains a cached image
- **THEN** it SHALL use `{ type: "image_ref", hash: string, mimeType: string }`
- **AND** Session SHALL depend on the image-resource contract rather than a UI type

#### Scenario: Compatibility import is used
- **WHEN** existing code imports ImageRef from a legacy module during migration
- **THEN** that module MAY re-export the owner-defined type
- **AND** new production imports SHALL use the owning module

### Requirement: SubAgent Message Log
The system SHALL record child Agent executions in `agentMessages` using
presentation-neutral Agent Process and execution records. Full child transcripts SHALL
remain in AgentProcessStore and SHALL NOT be inserted into Main Agent messages.

#### Scenario: Child Agent exits
- **WHEN** a child Agent reaches a terminal state
- **THEN** the parent Session SHALL persist stable process identity, Application, state,
  generic input/output, timestamps, and optional domain Tool execution records
- **AND** it SHALL not persist `AgentActivity`, `AgentToolActivity`, `ToolCallEntry`,
  `ToolResultProjection`, or another Presentation DTO

#### Scenario: Legacy VisionMessage migration
- **WHEN** a version 2 Session containing `visionMessages` is loaded
- **THEN** the records SHALL be converted to presentation-neutral AgentSessionMessage data
- **AND** the next save SHALL retain version 3 compatibility

## ADDED Requirements

### Requirement: Session data model has no Presentation dependency
Session type, store, manager, and migration modules MUST NOT import from `src/ui/`.
Rebuilding display messages SHALL occur through a Presentation projector outside the
Session persistence layer.

#### Scenario: Architecture dependencies are checked
- **WHEN** Session production code imports a UI shared type or formatter
- **THEN** architecture verification SHALL fail

#### Scenario: Session replay is requested
- **WHEN** TUI or Web loads a Session
- **THEN** HarnessAPI SHALL return a presentation-neutral snapshot or projected query result
- **AND** the selected Presentation adapter SHALL render the canonical conversation model
