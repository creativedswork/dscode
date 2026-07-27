## ADDED Requirements

### Requirement: Auto-generate open-design MCP entry from .env
When `--with-od` is passed and `OPEN_DESIGN_DIR` is set, the system SHALL ensure `~/.mcp.json` contains a valid `open-design` MCP server entry pointing to the local daemon CLI.

#### Scenario: Entry is created when missing
- **WHEN** `~/.mcp.json` does not contain an `open-design` key
- **THEN** the system SHALL add the entry with:
  - `"command": "npx"`
  - `"args": ["tsx", "<OPEN_DESIGN_DIR>/apps/daemon/src/cli.ts", "mcp", "--daemon-url", "http://127.0.0.1:<OD_PORT>"]`
- **AND** other existing entries in `~/.mcp.json` SHALL remain unchanged

#### Scenario: Entry is updated when path differs
- **WHEN** `~/.mcp.json` contains an `open-design` entry but `args[1]` (the daemon CLI path) does not match `<OPEN_DESIGN_DIR>/apps/daemon/src/cli.ts`
- **THEN** the system SHALL update `args[1]` and `args[4]` (the `--daemon-url` port) to match the current `.env` values

#### Scenario: Entry is left unchanged when matching
- **WHEN** `~/.mcp.json` contains an `open-design` entry with matching path and port
- **THEN** the system SHALL NOT modify the file

#### Scenario: ~/.mcp.json does not exist
- **WHEN** `~/.mcp.json` does not exist
- **THEN** the system SHALL create it with `{ "mcpServers": { "open-design": { ... } } }`

#### Scenario: ~/.mcp.json is not writable
- **WHEN** `~/.mcp.json` exists but cannot be written (permission denied)
- **THEN** the system SHALL print a warning and skip the auto-config
- **AND** dscode SHALL continue startup

#### Scenario: Auto-config only runs with --with-od
- **WHEN** `--with-od` is not passed
- **THEN** the system SHALL NOT read or modify `~/.mcp.json`

### Requirement: MCP entry path is local and absolute
The generated MCP entry SHALL reference the daemon CLI via a local absolute file path (not a remote package or registry).

#### Scenario: Path is local
- **WHEN** the MCP entry is generated
- **THEN** `args[1]` SHALL be an absolute path under `OPEN_DESIGN_DIR`/`apps/daemon/src/cli.ts`
- **AND** the `command` SHALL be `npx` (not a remote registry reference)

#### Scenario: OPEN_DESIGN_DIR tilde is expanded
- **WHEN** `OPEN_DESIGN_DIR` is set to `~/Workspace/DeepSeekSpace/open-design`
- **THEN** the path written to `~/.mcp.json` SHALL be the expanded absolute path (e.g., `/Users/.../open-design/apps/daemon/src/cli.ts`)
