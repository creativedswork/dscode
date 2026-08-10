## 1. Architecture Guardrails

- [x] 1.1 Add a TypeScript-AST architecture checker that classifies Bootstrap, Kernel, Application, Feature, Adapter, Persistence, and Presentation source paths.
- [x] 1.2 Encode forbidden dependency directions and exact Composition Root exceptions, including rejection of non-Presentation imports from `src/ui/`.
- [x] 1.3 Capture the current violations as an explicit file-to-file migration baseline and make the checker fail on any new violation.
- [x] 1.4 Add checker fixtures covering allowed owner-contract imports, forbidden Presentation imports, forbidden concrete adapter imports, and the Composition Root exception.
- [x] 1.5 Add `architecture:check` to package scripts and the standard build/verification workflow.

## 2. Owner-Defined Types

- [x] 2.1 Add owner type modules for Driver, Skill, Command, Memory, Permission, Context, Model/Retry, Runtime Config, Open Design, and image-resource identity.
- [x] 2.2 Convert `src/core/types.ts` into a documented temporary compatibility re-export module without locally defined feature types.
- [x] 2.3 Migrate production imports for Driver, Skill, Command, Memory, Permission, Context, Model/Retry, Vision, and Session types to their owning modules.
- [x] 2.4 Migrate Open Design and Integration config imports to Integration-owned type modules.
- [x] 2.5 Add type-level tests proving owner modules are usable without importing Core and update affected test fixtures.
- [x] 2.6 Remove the corresponding `core/types.ts` architecture-baseline entries and verify no new production import uses the compatibility path.

## 3. Kernel Execution Context ABI

- [x] 3.1 Add a Kernel-owned immutable ExecutionContext type and `runWithExecutionContext` / `getExecutionContext` AsyncLocalStorage API.
- [x] 3.2 Adapt AgentContext into ExecutionContext at Main/SubAgent Runtime entry while preserving concurrent cwd and process attribution.
- [x] 3.3 Migrate FS, Shell, Search, Edit, Checkpoint, anchor invalidation, and Logger code from `agents/process/context` to the Kernel ABI.
- [x] 3.4 Retain bounded compatibility re-exports for old context accessors and reject new imports through the architecture checker.
- [x] 3.5 Add concurrency, no-context fallback, Worktree path, Logger attribution, and forged-context tests.
- [x] 3.6 Remove old compatibility accessors and all Driver/utility-to-Agent implementation baseline entries.

## 4. Settings Repository and Runtime Snapshots

- [x] 4.1 Extract scoped JSON loading, atomic patching, path resolution, and safe persistence into a generic SettingsRepository.
- [x] 4.2 Add tests for user/project precedence, unrelated-key preservation, directory creation, invalid JSON handling, atomic writes, and serialized concurrent patches.
- [x] 4.3 Replace shared mutable ConfigWatch state with an internal immutable RuntimeConfigStore that atomically publishes complete validated snapshots.
- [x] 4.4 Add SettingsService commands for model, provider, thinking, API key, vision, project path, Skill state, and permission-policy updates.
- [x] 4.5 Ensure public configuration queries mask secrets and do not expose SettingsRepository, RuntimeConfigStore, or raw mutable config.
- [x] 4.6 Migrate PermissionManager to an injected PermissionPolicyStore bound to the active project and remove Core config imports.
- [x] 4.7 Migrate TUI/Web/Slash configuration writes and Skill persistence to SettingsService commands.
- [x] 4.8 Add parity tests proving equivalent TUI and Web settings commands produce one persisted patch, one runtime snapshot, and one config event.

## 5. Integration-Owned Configuration

- [x] 5.1 Make Integration registration pair each Integration with its typed resolver while keeping the heterogeneous registry type-safe internally.
- [x] 5.2 Pass raw scoped settings, compatibility environment input, and runtime overrides to IntegrationRegistry without adding feature fields to RuntimeConfig.
- [x] 5.3 Move `OpenDesignIntegrationConfig`, merge/default/validation logic, and legacy `.env` fallback fully under `src/integrations/open-design/`.
- [x] 5.4 Remove `integrations.openDesign` and `IntegrationsConfig` from Harness/Core runtime configuration.
- [x] 5.5 Preserve Open Design enablement, port/path precedence, `--with-od`, diagnostics, MCP contribution, and ServiceSupervisor behavior in focused tests.
- [x] 5.6 Add a fake second Integration test proving registration and typed config resolution require no Core type or config-loader modification.

## 6. Harness Application API

- [x] 6.1 Define capability-oriented Conversation, Session, Settings, Tool, Skill, Agent Process, Eval, and Project command/query ports with immutable result snapshots.
- [x] 6.2 Split event publication from the subscribe-only ApplicationEventSource exposed through HarnessAPI.
- [x] 6.3 Add a narrow UserInteractionPort for asynchronous permission decisions and inject it into PermissionManager coordination.
- [x] 6.4 Implement the new HarnessAPI facade without exposing Pi Agent, Managers, Registries, Supervisors, Config stores, ImagePipeline, or unmasked secrets.
- [x] 6.5 Add compile-time contract fixtures that accept supported commands/queries and reject concrete-manager, mutable-state, emit, and clear access.
- [x] 6.6 Migrate SlashCommandContext and built-in Slash Commands to HarnessAPI commands/queries plus a Presenter response port.
- [x] 6.7 Migrate Eval entry points and workers from full HarnessAPI Manager access to a narrow Eval Application port.

## 7. TUI and Web Boundary Migration

- [x] 7.1 Migrate TuiApp/TuiBackend prompt, abort, Session, Tool detail, context usage, MCP, Skill, Agent, and configuration access to HarnessAPI commands/queries.
- [x] 7.2 Remove TUI access to Pi Agent state, SessionManager, ContextManager, ToolRegistry, AgentSupervisor, ConfigWatch, and MCPManager.
- [x] 7.3 Migrate WebUiBackend handlers to the same commands/queries and retain existing WebSocket protocol messages and ordering.
- [x] 7.4 Remove Web access to Pi Agent state, concrete Managers/Registries, Settings I/O, ConfigWatch, and AgentSupervisor.
- [x] 7.5 Replace harness-access `as any`, optional method probing, and backend mock objects with declared ports.
- [x] 7.6 Add command/query contract tests for Session navigation, Tool result inspection, Skill toggle, MCP state, context usage, Agent activity, and configuration.

## 8. Runtime, Persistence, and Presentation Projection

- [x] 8.1 Define owner-neutral Tool execution, Agent activity, MCP state, Eval progress, Config change, and Session snapshot contracts.
- [x] 8.2 Refactor Application event composition to import owner-defined payloads and remove `src/ui/` imports from Core event modules.
- [x] 8.3 Move Tool result formatting and Agent label/activity conversion into pure Presentation projectors.
- [x] 8.4 Remove UI projection from PiAgentRuntimeAdapter and emit raw stable execution records instead.
- [x] 8.5 Remove UI DTO and formatter imports from Session types/display/persistence while preserving v1/v2/v3 Session compatibility.
- [x] 8.6 Remove UI theme/projector dependencies from Eval and UI runtime-bundle dependencies from MCP by introducing owner-neutral ports or resource modules.
- [x] 8.7 Route live events and persisted Session replay through shared Presentation projectors used by both TUI and Web.
- [x] 8.8 Add projector purity, stable Tool/Agent identity, live-vs-replay equivalence, and TUI/Web semantic parity tests.

## 9. Harness and Bootstrap Decomposition

- [x] 9.1 Extract ConversationCoordinator for Main prompt, retry, abort, processing, and turn-event workflows.
- [x] 9.2 Extract SessionCoordinator for save/load/switch, pending permission, Main Process rebind, and background Agent routing.
- [x] 9.3 Extract ProjectCoordinator for transactional project-scoped Settings, Skills, MCP, Integration, Session, and process-context reload.
- [x] 9.4 Extract McpController for MCP lifecycle, Driver contribution, ToolRegistry rebuild, App Host binding, and MCP-owned events.
- [x] 9.5 Extract AgentRuntimeCoordinator for Main/SubAgent Runtime construction, fallback registration, capability refresh, and process lifecycle binding.
- [x] 9.6 Change Harness construction to injected ports/coordinators and keep only Application lifecycle ordering and facade delegation.
- [x] 9.7 Move concrete component construction and Open Design registration to explicitly designated composition modules under `src/bootstrap/`.
- [x] 9.8 Remove TuiBackend/WebUiBackend imports and default-UI construction from Harness; add a headless Harness construction test.
- [x] 9.9 Preserve startup, shutdown, owned/external service, MCP reconnect, background continuation, and project-switch behavior in coordinator tests.

## 10. SDK Readiness Constraints

- [x] 10.1 Split source-neutral `AgentDefinition` authoring data from compiled `AgentApplicationSnapshot` source, digest, generation, and runtime metadata.
- [x] 10.2 Route Markdown Agent.md and trusted programmatic definitions through one validation, compilation, and capability-derivation path.
- [x] 10.3 Add programmatic Agent registration tests covering equivalent file/programmatic definitions and monotonic permission narrowing.
- [x] 10.4 Define AgentHost options, identity, Application API, startup, and idempotent shutdown contracts without declaring npm public exports.
- [x] 10.5 Implement `createStandardAgentHost()` as a reusable headless composition function containing the standard dscode feature set.
- [x] 10.6 Change the CLI bootstrap to call `createStandardAgentHost()` and keep TUI/Web selection, signal/fatal handlers, and process exit behavior in the CLI adapter.
- [x] 10.7 Add Host identity to Kernel Execution Context and propagate it through Agent Runtime entry, Logger, Checkpoint, and invalidation attribution.
- [x] 10.8 Move checkpoint, anchor invalidation, edit undo, provider registration, image cache, and other behavior-affecting module-level mutable state behind Host-owned facilities or immutable catalogs.
- [x] 10.9 Remove Application/Feature calls to `process.chdir()` and resolve project changes through Host workspace plus Execution Context defaults.
- [x] 10.10 Capture compatibility environment as an explicit read-only Host input and remove runtime writes to `process.env`.
- [x] 10.11 Add two-Host isolation tests for workspace paths, settings, events, Agent/Session stores, registries, caches, managed services, and independent shutdown.
- [x] 10.12 Add standard-feature parity and headless lifecycle tests proving CLI and non-CLI Hosts use the same composition path.

## 11. Cleanup, Documentation, and Verification

- [x] 11.1 Remove `core/types.ts` compatibility re-exports and other migration adapters after all production and test imports use owner paths.
- [x] 11.2 Reduce the architecture baseline to zero violations, retaining only exact documented Composition Root exceptions.
- [x] 11.3 Update `docs/ARCHITECTURE.md` with the ownership matrix, dependency diagram, Command/Query/Event boundary, Settings flow, Presentation projection, Execution Context ABI, and SDK-ready Host boundary.
- [x] 11.4 Update affected README/configuration documentation without changing documented user configuration formats or announcing an unpublished SDK.
- [x] 11.5 Run architecture check, typecheck, focused contract tests, multi-Host isolation tests, and the full unit suite.
- [x] 11.6 Rebuild `dist/dscode.mjs` and release/package resources, then run package verification without adding SDK exports.
- [x] 11.7 Run TUI PTY smoke and Web smoke tests covering prompt, abort, Session switch, project switch, settings update, Skill toggle, MCP state, and Tool detail.
- [x] 11.8 Run strict OpenSpec validation and confirm no active requirement still mandates public Manager access, UI-owned persistence types, direct feature config in Core, or process-global Host state.
