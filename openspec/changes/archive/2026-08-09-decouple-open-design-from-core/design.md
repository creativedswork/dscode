## Context

Open Design is an optional external MCP-backed application. The current implementation gives it a privileged path through the bootstrap:

- `src/core/main.ts` parses `--with-od`, reads Open Design environment variables, mutates MCP configuration, starts the child process, attaches restart handlers, and waits for health.
- `src/core/od-daemon.ts` combines Open Design command knowledge, generic child-process lifecycle behavior, health polling, signal hooks, and direct writes to `~/.mcp.json`.
- `src/core/main.ts` and `src/core/od-daemon.ts` both register process signal handlers, so shutdown ownership is distributed.
- Open Design configuration is duplicated across environment variables and a generated persistent MCP entry.

This conflicts with the Agent-as-OS model. `core` is the composition root and Harness kernel, while Open Design is an optional external application/device integration. Its daemon is not an `AgentProcess`, and its MCP proxy is already consumed through the generic MCP subsystem.

The change is backend-only. It must preserve normal TUI and Web startup, existing MCP behavior for unrelated servers, and non-blocking failure when Open Design is unavailable.

## Goals / Non-Goals

**Goals:**

- Keep Open Design-specific implementation outside `src/core/`.
- Add one reusable lifecycle owner for external processes started by dscode.
- Keep external service processes separate from `AgentSupervisor` and its Process Table.
- Make typed `settings.json` integration configuration the persistent source of truth.
- Derive the Open Design MCP server definition without mutating user files during startup.
- Preserve bounded health checks, restart protection, and graceful shutdown.
- Keep `--with-od` and environment variables as bounded migration inputs.
- Capture child output in the dscode logger instead of discarding diagnostics.

**Non-Goals:**

- Expose arbitrary user-defined daemon manifests in this change.
- Move MCP transport or reconnection responsibilities out of `MCPManager`.
- Model Open Design as an Agent Application, Skill, or Driver implementation.
- Add an Open Design UI or change existing TUI/Web rendering.
- Install, update, or build the Open Design repository.
- Introduce a general distributed scheduler or reuse `AgentSupervisor` for OS child processes.

## Decisions

### 1. Split generic service supervision from product integration

The implementation will introduce two top-level ownership areas:

```text
src/services/
  types.ts
  service-supervisor.ts

src/integrations/
  types.ts
  registry.ts
  open-design/
    config.ts
    service.ts
    mcp.ts
    index.ts
```

`ServiceSupervisor` owns reusable mechanics:

- spawn and child ownership;
- health polling;
- state transitions and diagnostics;
- bounded restart policy;
- graceful shutdown followed by forceful termination;
- child stdout/stderr projection into `Logger`.

`OpenDesignIntegration` owns Open Design knowledge:

- configuration validation and migration fallback;
- local command resolution;
- port and `/api/projects` health endpoint;
- restart and shutdown policy values;
- derived MCP server definition;
- Open Design-specific diagnostics.

This follows the OS model:

```text
AgentSupervisor       -> Agent processes
ServiceSupervisor     -> owned external service processes
IntegrationRegistry   -> optional external application adapters
MCPManager            -> MCP transport and tool connection lifecycle
```

Alternative considered: move `od-daemon.ts` to `src/drivers/`. Rejected because starting and supervising an external application is service lifecycle management, not a Tool-to-resource driver.

Alternative considered: move the file unchanged to `src/integrations/open-design/`. Rejected because it would preserve duplicated signal, restart, and health mechanisms rather than creating a reusable lifecycle boundary.

### 2. Use a declarative managed-service contract

`ServiceSupervisor` will accept a specification rather than Open Design callbacks embedded in `main.ts`:

```typescript
interface ManagedServiceSpec {
  id: string;
  command: {
    executable: string;
    args: string[];
    cwd: string;
    env?: Record<string, string>;
  };
  health?: {
    probe(signal: AbortSignal): Promise<boolean>;
    intervalMs: number;
    timeoutMs: number;
  };
  restart: {
    maxRapidRestarts: number;
    rapidRestartWindowMs: number;
  };
  shutdown: {
    graceMs: number;
  };
}
```

The contract remains internal. This change does not allow arbitrary executable definitions in user configuration. Integrations compile validated product configuration into trusted `ManagedServiceSpec` objects.

The supervisor returns status through an owned handle. A service that is already healthy before spawn is marked external/unowned; dscode must not restart or terminate a process it did not create.

Alternative considered: use `AgentProcess` and `AgentSupervisor`. Rejected because an external daemon has no Agent Application, model loop, AgentContext, transcript, capability set, or parent Session.

### 3. Centralize lifecycle ownership without module-level signal hooks

`src/services/` will not call `process.on()` directly. The composition root owns application shutdown and invokes:

```text
IntegrationRegistry.shutdown()
  -> ServiceSupervisor.shutdown()
     -> SIGTERM owned children
     -> wait grace period
     -> SIGKILL remaining children
```

Unexpected non-zero exit restarts an owned service according to its policy. Intentional shutdown, a normal zero exit, an unowned service, or an exhausted restart budget must not restart.

The current Open Design policy is preserved as at most three rapid restarts within a five-second window. The health timeout remains non-fatal: failure is logged and Harness startup continues.

Alternative considered: retain signal handlers inside the Open Design module. Rejected because multiple integrations would accumulate competing global hooks and make shutdown ordering nondeterministic.

### 4. Make integration settings the persistent source of truth

User or project `settings.json` will support:

```json
{
  "integrations": {
    "openDesign": {
      "enabled": true,
      "path": "/absolute/path/to/open-design",
      "port": 7456,
      "autoStart": true
    }
  }
}
```

Configuration rules:

- project integration fields override matching user fields through a field-level merge;
- omitted `port` defaults to `7456`;
- `enabled: false` disables both service startup and generated MCP contribution;
- `autoStart: false` contributes MCP configuration but assumes the daemon is managed externally;
- `--with-od` is normalized into a one-run `open-design` enable/auto-start override;
- `OPEN_DESIGN_DIR` and `OD_PORT` are read only when typed integration configuration is absent, with a deprecation diagnostic; the direct CLI may read only these two fields from the project `.env` when the process environment does not provide them;
- migration inputs are never written back automatically.

Environment variables and `--with-od` remain compatibility inputs, not independent persistent stores. A future change may remove them after a documented migration window.

Alternative considered: keep `.env` as the canonical source. Rejected because dscode already has scoped, observable configuration and direct environment reads bypass validation and configuration tooling.

### 5. Contribute MCP configuration in memory

An enabled Open Design integration will return an `MCPServerConfig` contribution:

```text
OpenDesignConfig
  -> OpenDesignIntegration.prepare()
  -> IntegrationContribution.mcpServers
  -> deterministic merge with loaded MCP config
  -> HarnessConfig.mcp
  -> MCPManager
```

Startup must not create or modify `~/.mcp.json` or project `.mcp.json`.

The generated server keeps the existing local CLI contract:

```text
npx tsx <open-design>/apps/daemon/src/cli.ts
  mcp --daemon-url http://127.0.0.1:<port>
```

When an enabled integration and a persistent MCP entry both use the reserved name `open-design`, the generated contribution wins for that run and emits a diagnostic. Other MCP entries remain unchanged. This makes the enabled integration configuration authoritative without silently deleting user data.

Alternative considered: continue synchronizing `.env` into `~/.mcp.json`. Rejected because it creates two persistent representations and performs an unrelated global write during every application startup.

### 6. Keep `main.ts` as the composition root

`main.ts` may know that integrations exist, but it will not implement Open Design behavior:

```typescript
const cli = parseArgs();
const baseConfig = loadConfig(cli.cwd);
const services = new ServiceSupervisor(harnessLogger);
const integrations = new IntegrationRegistry(services, harnessLogger);
const prepared = await integrations.prepare(baseConfig, cli.integrationOverrides);
const config = mergeIntegrationContributions(baseConfig, prepared);
const harness = new Harness(config, harnessLogger, cli.debug);

try {
  await harness.initialize();
  await harness.run(...);
} finally {
  await integrations.shutdown();
}
```

The legacy CLI parser may recognize `--with-od`, but it must normalize it to a generic integration override immediately. All subsequent Open Design branching belongs to the integration module.

No new runtime dependency is required.

### 7. Planned file and directory changes

```text
src/
├── core/
│   ├── main.ts                    # remove OD lifecycle block; compose integrations
│   ├── config.ts                  # parse/merge typed integration settings
│   ├── config-watch.ts            # expose immutable integration config
│   ├── types.ts                   # add IntegrationConfig types
│   └── od-daemon.ts               # DELETE
├── services/                      # NEW: generic owned-service mechanism
│   ├── types.ts
│   └── service-supervisor.ts
└── integrations/                  # NEW: optional product integrations
    ├── types.ts
    ├── registry.ts
    └── open-design/
        ├── config.ts
        ├── service.ts
        ├── mcp.ts
        └── index.ts

tests/
├── services/                      # NEW
│   └── service-supervisor.test.ts
└── integrations/
    └── open-design/               # NEW
        ├── config.test.ts
        ├── service.test.ts
        └── mcp.test.ts
```

Documentation changes:

- `docs/ARCHITECTURE.md`: add ServiceSupervisor and Integration layer ownership.
- `README.md` and `README.zh-CN.md`: document typed Open Design configuration and migration.
- `.env.example`: document Open Design environment compatibility and identify typed settings as the recommended persistent configuration.

## Risks / Trade-offs

- **\[Generic supervisor becomes an premature framework]** -> Keep its contract internal and implement only lifecycle behavior already required by Open Design.
- **\[Integration MCP contribution conflicts with a manual entry]** -> Use deterministic reserved-name precedence, emit a diagnostic, and never delete the persistent entry.
- **\[Legacy users lose automatic startup]** -> Retain `--with-od`, `OPEN_DESIGN_DIR`, and `OD_PORT` as fallback inputs for this migration.
- **\[Child processes survive abnormal termination]** -> Use process-group-aware termination where supported and retain bounded force-kill; document that `SIGKILL` of dscode itself cannot run cleanup.
- **\[Captured daemon output becomes noisy]** -> Route output through scoped logger events rather than directly to the TUI.
- **\[Health timeout delays startup]** -> Preserve the bounded timeout and continue Harness initialization after failure.
- **\[Project and user integration config merge unexpectedly]** -> Define field-level precedence and cover it with configuration tests.

## Migration Plan

1. Add typed integration configuration and compatibility parsing without changing startup behavior.
2. Implement and test `ServiceSupervisor` independently with deterministic fake child processes and health probes.
3. Implement `OpenDesignIntegration` and in-memory MCP contribution.
4. Switch `main.ts` to integration composition and centralized shutdown.
5. Remove `ensureOdMcpEntry`, Open Design-specific signal hooks, and `src/core/od-daemon.ts`.
6. Update documentation to recommend `settings.json`; retain environment fallback diagnostics.
7. Validate TUI and Web startup with integration disabled, externally running, successfully auto-started, failed, restarted, and shut down.

Rollback is code-only: restore the previous bootstrap block and `od-daemon.ts`. No persistent configuration migration is performed automatically, so rollback does not require data repair.

## Open Questions

- The version in which `OPEN_DESIGN_DIR`, `OD_PORT`, and `--with-od` can be removed is intentionally deferred; removal requires usage evidence and a separate breaking-change proposal.
