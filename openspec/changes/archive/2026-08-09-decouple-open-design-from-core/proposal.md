## Why

Open Design is an optional external integration, but its configuration, process lifecycle, health checks, restart policy, and MCP file mutation currently live directly in `src/core/main.ts` and `src/core/od-daemon.ts`. This couples the Harness bootstrap to one product-specific daemon, duplicates shutdown ownership, and prevents dscode from applying the same lifecycle mechanism to future external services.

## What Changes

- Introduce a generic managed-service supervisor for owned external processes, including startup, health checks, restart policy, logging, and graceful shutdown.
- Move all Open Design-specific command resolution, configuration, health endpoint, and MCP contribution logic into `src/integrations/open-design/`.
- Reduce `src/core/main.ts` to composition: load configuration, activate integrations, construct the Harness, and coordinate shutdown.
- Make `settings.json` integration configuration the single source of truth for Open Design path, port, enabled state, and auto-start behavior.
- Keep `--with-od` as a compatibility runtime override during migration, without making it a second persistent configuration source.
- Stop automatically writing or updating `~/.mcp.json`; derive the `open-design` MCP server definition in memory from the enabled integration configuration.
- Preserve startup resilience: an unavailable Open Design service must produce diagnostics without preventing normal dscode startup.
- Remove `src/core/od-daemon.ts` after its generic lifecycle behavior and Open Design-specific behavior have been separated.

## Capabilities

### New Capabilities

- `managed-service-supervision`: Generic ownership, health, restart, logging, and shutdown contracts for external services started by dscode.

### Modified Capabilities

- `od-daemon-auto-start`: Resolve Open Design startup from integration configuration and delegate execution to the managed-service supervisor while retaining the `--with-od` compatibility override.
- `od-daemon-lifecycle`: Replace Open Design-specific signal hooks and restart code with centralized owned-service lifecycle management.
- `od-mcp-auto-config`: Replace persistent `~/.mcp.json` mutation with deterministic in-memory MCP configuration contribution.
- `open-design-env-config`: Replace `.env` as the primary Open Design configuration source with typed `settings.json` integration configuration and a bounded migration fallback.

## Impact

- **New directories**: `src/services/`, `src/integrations/`, `tests/services/`, and `tests/integrations/open-design/`.
- **Moved responsibilities**: Open Design command/config/MCP logic leaves `src/core/`; reusable process lifecycle behavior moves to `src/services/`.
- **Modified composition**: `src/core/main.ts`, `src/core/config.ts`, `src/core/types.ts`, and `src/core/config-watch.ts`.
- **Removed module**: `src/core/od-daemon.ts`.
- **Configuration**: user/project `settings.json` gains `integrations.openDesign`; legacy `OPEN_DESIGN_DIR`, `OD_PORT`, and `--with-od` receive explicit migration behavior.
- **MCP**: the enabled integration contributes an ephemeral `MCPServerConfig`; persistent user and project MCP files are no longer modified by startup.
- **Tests and docs**: add deterministic service/integration tests and update CLI, configuration, and architecture documentation.
