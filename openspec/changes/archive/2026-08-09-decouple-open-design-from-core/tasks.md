## 1. Typed Integration Configuration

- [x] 1.1 Add immutable integration and Open Design configuration types to `src/core/types.ts`, including `enabled`, `path`, `port`, and `autoStart`.
- [x] 1.2 Extend `loadConfig()` to field-merge user and project `integrations.openDesign` settings, validate field types and port range, and apply port `7456` by default.
- [x] 1.3 Implement the bounded `OPEN_DESIGN_DIR` and `OD_PORT` compatibility fallback, including direct-CLI project `.env` lookup, with deprecation diagnostics and no automatic persistence.
- [x] 1.4 Ensure explicit typed disablement takes precedence over environment fallback and `ConfigWatch` exposes the normalized integration configuration without direct mutation.
- [x] 1.5 Add config tests for user/project precedence, defaults, invalid values, explicit disablement, and legacy environment fallback.

## 2. Managed Service Supervisor

- [x] 2.1 Create `src/services/types.ts` with trusted `ManagedServiceSpec`, health, restart, shutdown, status, ownership, and handle contracts.
- [x] 2.2 Implement `src/services/service-supervisor.ts` with pre-start health detection, owned child spawn, bounded readiness polling, and cancellation.
- [x] 2.3 Implement owned-versus-external service tracking so externally running services are never restarted or terminated.
- [x] 2.4 Implement bounded rapid-restart handling that suppresses restart during shutdown, after normal exit, and after budget exhaustion.
- [x] 2.5 Implement idempotent asynchronous shutdown using graceful termination followed by forceful process-group-aware termination after the configured grace period.
- [x] 2.6 Route child stdout, stderr, spawn failures, health state, exits, and restart exhaustion through scoped `Logger` events.
- [x] 2.7 Add deterministic `tests/services/service-supervisor.test.ts` coverage for ownership, health success/timeout/cancellation, restart budget, output logging, and graceful/forceful shutdown.

## 3. Integration Framework and Open Design Adapter

- [x] 3.1 Create `src/integrations/types.ts` and `src/integrations/registry.ts` for integration preparation, MCP contributions, diagnostics, runtime overrides, and coordinated shutdown.
- [x] 3.2 Implement deterministic MCP contribution merging by server name while preserving unrelated user and project MCP definitions.
- [x] 3.3 Create `src/integrations/open-design/config.ts` to normalize typed settings, compatibility overrides, tilde expansion, and Open Design-specific diagnostics.
- [x] 3.4 Create `src/integrations/open-design/service.ts` to resolve the project-local `od` executable or `pnpm` fallback and declare port, `--no-open`, `/api/projects` health, restart, and shutdown policies.
- [x] 3.5 Create `src/integrations/open-design/mcp.ts` to derive the local `open-design` `MCPServerConfig` in memory without filesystem writes.
- [x] 3.6 Create `src/integrations/open-design/index.ts` to contribute MCP configuration and optionally ensure the daemon through ServiceSupervisor.
- [x] 3.7 Add `tests/integrations/open-design/` coverage for configuration normalization, command resolution, already-running detection, disabled/manual/auto-start modes, MCP derivation, and reserved-name conflicts.

## 4. Core Bootstrap Migration

- [x] 4.1 Normalize the legacy `--with-od` flag in `src/core/main.ts` into a one-run `open-design` integration enable/auto-start override.
- [x] 4.2 Load base configuration before integration preparation, construct ServiceSupervisor and IntegrationRegistry, and merge their contributions before Harness initialization.
- [x] 4.3 Wrap Harness startup and run in centralized cleanup so integrations shut down exactly once after normal completion or startup failure.
- [x] 4.4 Remove Open Design command resolution, health polling, restart handlers, environment reads, and MCP mutation from `src/core/main.ts`.
- [x] 4.5 Delete `src/core/od-daemon.ts` and remove all imports and direct calls to `ensureOdMcpEntry`, `startOdDaemon`, `waitForOdDaemon`, and `registerOdCleanup`.
- [x] 4.6 Verify integration modules and ServiceSupervisor install no module-level process signal hooks and remain outside `AgentSupervisor`.

## 5. Compatibility and Lifecycle Verification

- [x] 5.1 Verify dscode startup remains unchanged when Open Design is disabled or unconfigured in both TUI and Web modes.
- [x] 5.2 Verify `--with-od` and legacy environment values, including project `.env` values under the direct CLI, still enable a one-run Open Design integration with a deprecation diagnostic.
- [x] 5.3 Verify integration preparation never creates, updates, or deletes user/project `.mcp.json` or `settings.json`.
- [x] 5.4 Verify a persistent `open-design` MCP conflict emits a diagnostic, uses the integration contribution for the current run, and preserves the persistent file.
- [x] 5.5 Verify an unavailable, unhealthy, or restart-exhausted Open Design daemon does not prevent Harness initialization or unrelated MCP server startup.
- [x] 5.6 Verify normal shutdown terminates only owned service processes and does not terminate an externally running Open Design daemon.

## 6. Documentation and Final Validation

- [x] 6.1 Update `docs/ARCHITECTURE.md` with the ServiceSupervisor/Integration boundaries, OS mapping, startup flow, and revised source tree.
- [x] 6.2 Update `README.md` and `README.zh-CN.md` with `integrations.openDesign` settings, `--with-od` compatibility behavior, and environment migration guidance.
- [x] 6.3 Restore bounded Open Design compatibility guidance in `.env.example`, while identifying typed settings as the recommended persistent configuration and retaining repository-wide `.env` ignore policy.
- [x] 6.4 Run targeted service, integration, config, MCP, and core tests and resolve all failures.
- [x] 6.5 Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run package:verify`.
- [x] 6.6 Run strict OpenSpec validation and confirm the change is apply-ready.
