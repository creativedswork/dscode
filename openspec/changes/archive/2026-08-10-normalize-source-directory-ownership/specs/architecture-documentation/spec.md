## ADDED Requirements

### Requirement: Source directory documentation reflects active owners

Architecture documentation SHALL include the active top-level source tree and
the responsibility of each Bootstrap, Kernel, Application, Feature, Adapter,
Persistence, and Presentation owner. Documented paths and components MUST exist
in the current source tree and MUST use the same classifications as the
automated architecture checker.

#### Scenario: Reader follows the source tree

- **WHEN** a reader uses `docs/ARCHITECTURE.md` to locate Harness, Agent definitions, Slash Commands, Project Files, Skills, MCP, or a Presentation adapter
- **THEN** every documented path SHALL resolve to the current owner
- **AND** the document SHALL distinguish `src/application/` use-case coordination from `AgentApplication` definitions under `src/agents/definitions/`

#### Scenario: Removed component is searched

- **WHEN** a Registry, Factory, compatibility entry, or source root is removed
- **THEN** architecture diagrams and startup flows SHALL stop naming it
- **AND** documentation verification SHALL reject stale references to `IntegrationRegistry`, `src/core/`, or `src/utils/`

### Requirement: Capability grouping does not imply shared source ownership

Architecture documentation SHALL distinguish user-facing capability taxonomy
from source-code ownership. In particular, it SHALL document Skill and MCP as
independent sibling owners even when Presentation displays them in the same
capability group.

#### Scenario: Reader compares Skill and MCP

- **WHEN** a reader inspects their architecture responsibilities
- **THEN** Skill SHALL own declarative instructions, activation, and Tool allowlists
- **AND** MCP SHALL own protocol, transport, connection, Server state, and Driver contribution
- **AND** the documentation SHALL NOT introduce a shared Skill/MCP lifecycle or Registry
