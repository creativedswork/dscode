## MODIFIED Requirements

### Requirement: Harness uses ConfigWatch for all config mutations
Harness SHALL consume validated immutable runtime configuration snapshots and SHALL
request persistent changes through the Application SettingsService. A runtime config
store MAY replace ConfigWatch or retain its name internally, but it MUST publish new
snapshots instead of sharing one mutable `HarnessConfig` reference. External code MUST
NOT receive the mutation-capable store.

#### Scenario: Model configuration changes
- **WHEN** the model-settings Application command succeeds
- **THEN** SettingsService SHALL persist and validate the change
- **AND** Harness SHALL apply one new runtime snapshot and publish one config event

#### Scenario: Consumer reads configuration
- **WHEN** Presentation queries current configuration
- **THEN** it SHALL receive an immutable public snapshot with secrets masked
- **AND** it SHALL not receive the mutable backing object

### Requirement: updateProjectPath re-initializes ToolRegistry after MCP reload
The project-switch Application use case SHALL delegate project-scoped reload work to a
ProjectCoordinator. After MCP definitions and Integration contributions are resolved,
the coordinator SHALL rebuild ToolRegistry and update Main Agent capabilities before
committing the target project snapshot.

#### Scenario: ToolRegistry is rebuilt for the target project
- **WHEN** project switch resolves a different set of MCP and Integration Tools
- **THEN** ProjectCoordinator SHALL rebuild the ToolRegistry before commit
- **AND** subsequent Agent requests SHALL use only Tool objects from the target project

#### Scenario: Reload fails before commit
- **WHEN** a required project reload step fails
- **THEN** the current project ToolRegistry and runtime snapshot SHALL remain active
- **AND** Presentation SHALL receive a failed command result

### Requirement: updateProjectPath merges user-level MCP config
ProjectCoordinator SHALL obtain MCP configuration through the MCP/config owner, which
merges user and project `.mcp.json` scopes with project precedence and retains the
documented deprecated fallback. Harness and Presentation MUST NOT duplicate MCP file
loading or merge logic.

#### Scenario: User and project MCP definitions are loaded
- **WHEN** a project switch targets a project with scoped MCP definitions
- **THEN** the MCP owner SHALL return one validated merged definition set
- **AND** ProjectCoordinator SHALL use that set for the target runtime

#### Scenario: Presentation requests project switch
- **WHEN** TUI or Web selects a new project path
- **THEN** it SHALL submit one project-switch command
- **AND** it SHALL not load MCP or settings files itself

### Requirement: Harness implements HarnessAPI
Harness or a dedicated facade SHALL implement the narrow HarnessAPI command, query, and
event contracts. Agent, SessionManager, MemoryManager, DriverRegistry, ToolRegistry,
SkillManager, PermissionManager, ContextManager, MCPManager, ConfigWatch, ImagePipeline,
and AgentSupervisor MUST NOT be public HarnessAPI fields.

#### Scenario: Internal subsystem is needed by a coordinator
- **WHEN** an Application coordinator needs a concrete subsystem
- **THEN** it SHALL receive that subsystem through construction or internal composition
- **AND** Presentation SHALL remain unable to retrieve it through HarnessAPI

#### Scenario: UI requests subsystem state
- **WHEN** Presentation needs state owned by an internal subsystem
- **THEN** HarnessAPI SHALL return a read-only query snapshot
- **AND** the subsystem's mutable API SHALL remain private

### Requirement: Harness constructs and owns ImagePipeline
The Composition Root SHALL construct the image-processing implementation and inject an
image-processing port into Application coordination. Harness MAY own its operational
lifecycle after injection, but MUST NOT construct the concrete ImagePipeline or expose
it through HarnessAPI.

#### Scenario: Application starts
- **WHEN** the Composition Root assembles dscode
- **THEN** it SHALL construct the configured image-processing adapter
- **AND** Harness SHALL depend on its narrow processing and shutdown port

#### Scenario: UI submits images
- **WHEN** Presentation submits a prompt with images
- **THEN** the Application command SHALL coordinate image processing
- **AND** Presentation SHALL not call ImagePipeline directly

### Requirement: Harness creates and owns HarnessEventBus
The Composition Root SHALL create or provide the concrete Application event bus before
runtime components begin publishing. Harness SHALL own the event lifecycle after
injection, while consumers receive only the subscribe-only event source.

#### Scenario: Application is assembled
- **WHEN** Harness is constructed
- **THEN** an event publisher and event source SHALL already be available
- **AND** coordinators SHALL publish through the internal publisher port

#### Scenario: Presentation subscribes
- **WHEN** a UI backend is constructed
- **THEN** it SHALL receive the subscribe-only source
- **AND** it SHALL not access event publication or handler clearing operations

### Requirement: Harness emits events instead of calling UiBackend directly
Harness and Application coordinators SHALL communicate observable state through typed
Application events and request interactive decisions through a narrow UserInteraction
port. They MUST NOT import, construct, cast, or call concrete TUI/Web implementations.

#### Scenario: Agent streams output
- **WHEN** the runtime produces thinking, text, Tool, turn, or Agent lifecycle changes
- **THEN** Application coordination SHALL publish the corresponding typed events
- **AND** no concrete UI method SHALL be called

#### Scenario: Permission requires user input
- **WHEN** PermissionManager requires an interactive decision
- **THEN** it SHALL invoke the injected UserInteraction request-response port
- **AND** that port SHALL not expose rendering implementation details

### Requirement: Harness emits config and MCP events directly
SettingsCoordinator and MCPController SHALL publish owner-defined configuration and MCP
state events through the Application event publisher. Harness MAY coordinate lifecycle
ordering, but MUST NOT construct Presentation DTOs or call UI refresh methods.

#### Scenario: Configuration snapshot commits
- **WHEN** SettingsService commits a validated runtime snapshot
- **THEN** a configuration-changed domain event SHALL be published
- **AND** Presentation SHALL project it into `ConfigData`

#### Scenario: MCP state changes
- **WHEN** MCPController observes connection or Tool-catalog state changes
- **THEN** it SHALL publish an MCP-owned state snapshot
- **AND** Presentation SHALL project that snapshot for TUI and Web
