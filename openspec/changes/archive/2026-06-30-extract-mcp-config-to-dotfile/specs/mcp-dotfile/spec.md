## Purpose

MCP server configuration is stored in `.mcp.json` files, separate from `settings.json`. This separation keeps sensitive MCP credentials out of git while allowing `settings.json` (permissions, skills, retry) to be safely version-controlled.

## Requirements

### Requirement: MCP config loaded from .mcp.json

`loadConfig()` and `updateProjectPath()` SHALL load MCP server configurations from dedicated `.mcp.json` files:

- `~/.mcp.json` — user-level MCP servers, available across all projects
- `<project>/.mcp.json` — project-level MCP servers

#### Scenario: Project .mcp.json takes precedence

- **WHEN** both `~/.mcp.json` and `<project>/.mcp.json` define a server with the same `name`
- **THEN** the project-level configuration SHALL win, deeply merged (project keys override user keys for that server)

#### Scenario: No .mcp.json exists

- **WHEN** neither `~/.mcp.json` nor `<project>/.mcp.json` exists
- **THEN** the system SHALL fall back to reading `mcp.servers` / `mcpServers` from `settings.json`
- **AND** SHALL print a deprecation warning to stderr

#### Scenario: .mcp.json exists alongside settings.json MCP config

- **WHEN** `.mcp.json` exists and `settings.json` also contains `mcp.servers` / `mcpServers`
- **THEN** `.mcp.json` SHALL take precedence and `settings.json` MCP config SHALL be silently ignored (no warning, since the user has explicitly migrated)

### Requirement: .mcp.json file format

The `.mcp.json` file SHALL use the same format as the `mcpServers` section in `settings.json`:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "...",
      "args": ["..."],
      "url": "...",
      "transport": "...",
      "headers": { "..." },
      "env": { "..." }
    }
  }
}
```

The top-level key SHALL be `mcpServers` to maintain format compatibility with the existing `settings.json` path and to reserve namespace for future MCP-global settings (e.g., `mcpDefaults`, `mcpTimeout`).

#### Scenario: Valid .mcp.json

- **WHEN** `.mcp.json` contains a valid `mcpServers` object
- **THEN** servers SHALL be parsed identically to the `mcpServers` section of `settings.json`

#### Scenario: Empty .mcp.json

- **WHEN** `.mcp.json` exists but contains no `mcpServers` key
- **THEN** no MCP servers SHALL be loaded from that file

### Requirement: settings.json MCP config is deprecated

Existing `mcp.servers` and `mcpServers` entries in `settings.json` SHALL continue to work during a transition period, but SHALL emit a deprecation warning.

#### Scenario: MCP in settings.json with no .mcp.json

- **WHEN** `loadConfig()` detects `mcp.servers` or `mcpServers` in `settings.json` and no `.mcp.json` exists
- **THEN** the config SHALL be loaded normally
- **AND** a warning SHALL be printed to stderr suggesting migration to `.mcp.json`

#### Scenario: Both .mcp.json and settings.json MCP config present

- **WHEN** `.mcp.json` exists and `settings.json` also contains MCP config
- **THEN** `.mcp.json` SHALL take full precedence
- **AND** no deprecation warning SHALL be emitted (user has already migrated)

### Requirement: Web UI saves to .mcp.json

When the Web UI or TUI writes MCP server configuration changes, they SHALL be written to `.mcp.json`, not to `settings.json`.

#### Scenario: Adding a server via Web UI

- **WHEN** a user adds an MCP server through the settings UI
- **THEN** the new server SHALL be persisted to `<project>/.mcp.json` (or `~/.mcp.json` if editing user-level config)

#### Scenario: Removing a server via Web UI

- **WHEN** a user removes an MCP server through the settings UI
- **THEN** the server entry SHALL be removed from `.mcp.json`
