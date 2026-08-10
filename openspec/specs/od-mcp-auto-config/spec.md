# od-mcp-auto-config Specification

## Purpose
TBD - created by archiving change add-open-design-daemon-auto-start. Update Purpose after archive.
## Requirements
### Requirement: Open Design MCP configuration is derived in memory
An enabled Open Design integration SHALL derive one `MCPServerConfig` named `open-design` from its validated integration path and port and contribute it to Harness configuration before MCPManager initialization.

#### Scenario: Enabled integration contributes MCP server
- **WHEN** `integrations.openDesign.enabled` is true with valid configuration
- **THEN** the integration SHALL contribute an MCP server named `open-design`
- **AND** its command SHALL invoke the local Open Design daemon CLI in MCP mode
- **AND** its daemon URL SHALL use the configured port

#### Scenario: Disabled integration contributes nothing
- **WHEN** `integrations.openDesign.enabled` is false
- **THEN** the integration SHALL NOT contribute an `open-design` MCP server

#### Scenario: Tilde path is normalized
- **WHEN** the configured Open Design path starts with `~`
- **THEN** the derived daemon CLI argument SHALL contain an expanded absolute path

### Requirement: Integration contribution merge is deterministic
Integration-contributed MCP servers SHALL be merged with loaded user and project MCP servers by server name without changing unrelated entries.

#### Scenario: No persistent name conflict exists
- **WHEN** no loaded MCP server is named `open-design`
- **THEN** the generated Open Design server SHALL be appended to Harness MCP configuration
- **AND** all loaded MCP servers SHALL remain unchanged

#### Scenario: Persistent open-design entry conflicts
- **WHEN** an enabled integration and persistent MCP configuration both define `open-design`
- **THEN** the integration-derived definition SHALL be used for the current run
- **AND** the system SHALL emit a configuration-conflict diagnostic
- **AND** the persistent entry SHALL remain unchanged on disk

### Requirement: Startup does not mutate persistent MCP files
Preparing the Open Design integration SHALL NOT create, update, or delete user or project MCP configuration files.

#### Scenario: User MCP file does not exist
- **WHEN** the Open Design integration is prepared and `~/.mcp.json` does not exist
- **THEN** startup SHALL NOT create `~/.mcp.json`
- **AND** the integration-derived MCP server SHALL still be available in memory

#### Scenario: User MCP file contains stale generated entry
- **WHEN** `~/.mcp.json` contains an older `open-design` entry
- **THEN** startup SHALL NOT rewrite or delete that entry
- **AND** the system SHALL use deterministic in-memory merge precedence

#### Scenario: Integration preparation fails
- **WHEN** Open Design configuration cannot produce a valid MCP server definition
- **THEN** the system SHALL emit a diagnostic
- **AND** unrelated persistent MCP servers SHALL continue to initialize

