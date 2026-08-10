## MODIFIED Requirements

### Requirement: Backend constructors accept HarnessEventBus
TUI and Web backend constructors SHALL receive the narrow HarnessAPI and its
subscribe-only event source. They MUST NOT receive the concrete HarnessEventBus
publisher, concrete Harness class, Manager instances, mutable Runtime config store,
or Pi Agent instance.

#### Scenario: TUI backend is constructed
- **WHEN** the Composition Root selects TUI mode
- **THEN** TUI SHALL subscribe through HarnessAPI events and use HarnessAPI queries/commands
- **AND** it SHALL not receive internal Agent, Manager, Registry, or Supervisor objects

#### Scenario: Web backend is constructed
- **WHEN** the Composition Root selects Web mode
- **THEN** Web SHALL subscribe through the same event source and use the same use cases
- **AND** HTTP/WebSocket dependencies SHALL remain Web adapter dependencies

### Requirement: getPromptPermission remains direct method
Interactive permission prompting SHALL remain a direct asynchronous request-response
port because the caller must await a decision. The Application SHALL depend on a narrow
`UserInteractionPort`, and the selected UI backend SHALL implement or adapt that port.

#### Scenario: Permission decision is requested
- **WHEN** PermissionManager requires user authorization
- **THEN** the Application SHALL await the UserInteractionPort result
- **AND** the result SHALL contain only permission-domain data

#### Scenario: Backend implementation changes
- **WHEN** TUI and Web implement different rendering and transport mechanisms
- **THEN** both SHALL satisfy the same UserInteractionPort
- **AND** PermissionManager SHALL not import either backend

## ADDED Requirements

### Requirement: UI backend lifecycle is assembled outside Harness
The Composition Root SHALL select and construct the concrete UI backend. Harness
MUST NOT import `TuiBackend`, `WebUiBackend`, or instantiate a default UI.

#### Scenario: CLI starts without web flag
- **WHEN** bootstrap selects TUI mode
- **THEN** bootstrap SHALL construct TuiBackend and connect it to HarnessAPI
- **AND** Harness runtime code SHALL remain independent of TUI packages

#### Scenario: Headless Application test
- **WHEN** Harness is tested without Presentation
- **THEN** it SHALL start with test ports and no TUI/Web module import
