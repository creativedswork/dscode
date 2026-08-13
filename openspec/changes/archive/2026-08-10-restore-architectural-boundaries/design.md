## Context

dscode 当前有 156 个 TypeScript 源文件、约 3.56 万行代码。文件级 import 图没有直接
循环，但目录级职责形成了广泛的双向依赖：

- `core/types.ts` 定义或 re-export Integration、Driver、Skill、Command、Memory、
  Permission、Vision、Session 和 UI 相关类型；
- `HarnessAPI` 暴露 Pi Agent、Manager、Registry、Supervisor、ConfigWatch 和可变 config，
  TUI/Web/Slash Command 因而绕过应用用例直接操作内部状态；
- `Harness` 超过 2000 行，同时构造组件、运行 Agent、切换 Session/项目、管理 MCP、
  处理 Vision、持久化配置并选择 UI；
- Session、Agent Runtime、Core Events、Eval 和 MCP App Host 存在对 `src/ui/` DTO、
  formatter、theme 或 projector 的反向引用；
- Permission 和 UI 直接调用 Core 配置 I/O，typed validation、文件 patch 和运行时状态
  更新没有单一所有者；
- Driver、Logger 和 Checkpoint 通过 `agents/process/context.ts` 获取隐式上下文，使通用
  Kernel ABI 看起来属于 Agent 具体实现。

这些问题主要是编译边界和所有权问题，不是运行时 import cycle。迁移必须保持
`settings.json` SSoT、`.mcp.json` 行为、Session schema、CLI/TUI/Web 协议与用户交互兼容。

## Goals / Non-Goals

**Goals:**

- 让目录表达的边界成为可编译、可测试、可持续执行的依赖规则。
- 让类型、配置、事件和持久化数据由语义所有者定义。
- 将 HarnessAPI 收敛为稳定的 Application Command/Query/Event port。
- 让 UI 只负责输入适配、事件投影和渲染，不接触 PCB、Manager 或 mutable store。
- 让 Integration 自己拥有配置和 Service/Driver contribution，Core 不枚举具体设备。
- 保持 Agent Process 与 Managed Service Process 的独立监管模型。
- 让标准 Agent Host 可在没有 CLI/TUI/Web 的情况下构造、启动和关闭。
- 让同一进程中的多个 Agent Host 拥有隔离的 workspace、配置、事件、进程表和缓存。
- 通过渐进式迁移和兼容 re-export 控制一次性改动风险。

**Non-Goals:**

- 不改变 TUI/Web 视觉、交互、wire protocol 或 CLI 参数。
- 不改变 `settings.json`、`.mcp.json` 和现有 Session 文件格式。
- 不引入 DI framework、通用 plugin container 或新的运行时依赖。
- 不把所有模块强行改造成微服务，也不为每个函数建立 interface。
- 不改变 AgentSupervisor、ServiceSupervisor、MCP protocol 和 Tool 行为语义。
- 不在本变更中移除 `.env` 或 `--with-od` 兼容入口。
- 不在本变更中发布 npm SDK、增加 library package exports 或承诺 public API SemVer。
- 不在本变更中开放任意第三方 Feature、Driver 或 Integration plugin SPI。

## Decisions

### 1. Use explicit architectural rings and one composition exception

目标依赖关系：

```text
                    ┌──────────────────────────┐
                    │ Bootstrap / Composition  │
                    │ concrete construction only│
                    └────────────┬─────────────┘
                                 │ injects
                                 ▼
┌──────────────┐     ┌──────────────────────────┐
│ TUI / Web    │────▶│ Application / HarnessAPI │
│ Presentation │     │ Commands Queries Events  │
└──────────────┘     └────────────┬─────────────┘
                                 │ owner-defined ports
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       Agent / Session     MCP / Integration   Settings / Memory
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 ▼
                    Drivers / Storage / Services

Kernel facilities used across capabilities:
  EventBus · ExecutionContext · lifecycle primitives
```

边界矩阵：

| Layer | Owns | May depend on | Must not depend on |
|------|------|---------------|--------------------|
| Bootstrap | CLI parse, concrete construction, shutdown order | all concrete implementations | feature parsing and workflows |
| Kernel | EventBus, ExecutionContext, generic lifecycle primitives | platform/runtime libraries | UI, device config, feature persistence |
| Application | use cases, coordinators, HarnessAPI | owner-defined domain ports and Kernel | concrete UI, filesystem adapters, device-specific types |
| Feature | Agent/Session/MCP/etc. domain types and behavior | own contracts, Kernel ABI, injected ports | UI DTO, Core catch-all types |
| Adapter | filesystem, model, MCP, Driver, Integration implementations | implemented ports and domain types | Presentation state |
| Presentation | input adapters, projectors, TUI/Web models | HarnessAPI, public snapshots | Agent/Manager/Registry/Store internals |

Only `src/bootstrap/` may assemble concrete implementations across rings. A temporary exception
for `src/core/main.ts` is allowed until the bootstrap entry moves. Exceptions are exact files,
not directory-wide wildcards.

Alternative considered: retain informal layering and only move Open Design types. Rejected
because the same ownership leak already exists for Driver, Permission, Memory, Session and UI.

### 2. Move types to semantic owners, not a new shared bag

Target ownership includes:

```text
src/integrations/open-design/types.ts  OpenDesignIntegrationConfig
src/drivers/types.ts                   Driver
src/skills/types.ts                    Skill, SkillManifest
src/commands/types.ts                  CommandManifest
src/memory/types.ts                    MemoryConfig, MemoryEntry
src/permissions/types.ts               permission config/rules/prompt contracts
src/context/types.ts                   ContextConfig
src/models/types.ts                    ThinkingLevel, retry/model config
src/config/types.ts                    aggregate RuntimeConfig and public snapshots
src/resources/images/types.ts          ImageRef and image-resource identity
src/kernel/execution-context.ts        cross-cutting execution identity ABI
```

`core/types.ts` becomes a temporary re-export-only compatibility module and is removed after
all production consumers migrate. Session types are imported directly from `session/types.ts`.
No replacement `shared/types.ts` is introduced outside Presentation.

Alternative considered: keep all types central for convenient imports. Rejected because
convenience hides ownership and forces unrelated changes through Core.

### 3. Redefine HarnessAPI as a capability-oriented Application facade

The public shape is conceptually:

```ts
interface HarnessAPI {
  readonly conversation: ConversationCommands & ConversationQueries;
  readonly sessions: SessionCommands & SessionQueries;
  readonly settings: SettingsCommands & SettingsQueries;
  readonly tools: ToolQueries;
  readonly skills: SkillCommands & SkillQueries;
  readonly agents: AgentProcessQueries;
  readonly eval: EvalCommands;
  readonly events: ApplicationEventSource;
}
```

These properties are ports consisting of methods and immutable result types, not concrete
Manager instances. Grouping by capability avoids one flat mega-interface while preserving
one dependency for TUI/Web. Commands own invariant-preserving workflows; Queries return
snapshots. Tool result detail is resolved through stable references.

`UserInteractionPort` remains a separate request-response port for permission prompts.
Presentation implements it; PermissionManager receives it by injection.

The `HarnessAPI` name remains during this change to limit churn. Its semantics change from
Service Locator to Application facade.

Alternative considered: expose readonly concrete Managers. Rejected because readonly
references still expose mutable methods and implementation-specific data.

### 4. Separate persistent settings, typed resolution, and runtime snapshots

Configuration flow:

```text
settings.json / config.json / .mcp.json
                  │
                  ▼
        SettingsRepository (raw scoped I/O)
                  │
       ┌──────────┼───────────┐
       ▼          ▼           ▼
  core resolver  feature    Integration<T>.resolveConfig
                resolver
       └──────────┼───────────┘
                  ▼
         SettingsService commands
       validate → atomic patch → reload
                  ▼
        RuntimeConfigStore immutable snapshot
                  ▼
          Application config event
                  ▼
       Presentation public masked projection
```

SettingsRepository owns safe JSON reading and atomic scoped patches but knows no Open Design,
Permission or Skill semantics. Each owner parses its namespace. SettingsService coordinates
persistence and runtime application. Process environment overrides remain explicit adapters,
not a generic `settings.env`.

Integration becomes generic internally:

```ts
interface Integration<TConfig> {
  readonly id: string;
  resolveConfig(source: IntegrationSettingsSource): ConfigResolution<TConfig>;
  prepare(context: IntegrationPrepareContext<TConfig>): Promise<IntegrationContribution>;
}
```

IntegrationRegistry may erase `TConfig` inside its heterogeneous registry, but the typed pair
between one Integration and its resolver is established at registration. `HarnessConfig` no
longer contains `integrations.openDesign`.

Alternative considered: let Core aggregate every typed feature config. Rejected because every
new Integration would modify Core.

### 5. Split domain records from Presentation projection

Live and persisted paths converge at Presentation:

```text
Runtime event ───────────────┐
                            ├─▶ pure Presentation projector ─▶ canonical UI model
Persisted domain snapshot ──┘
```

Session persists raw Main messages, AgentSessionMessage and owner-defined Tool execution records.
Agent Runtime emits raw progress/result records. MCP emits MCP snapshots. Eval emits Eval state.
Core/Application composes their event types but does not redefine payloads using UI types.

`src/ui/shared/` remains the canonical TUI/Web Presentation model. Only UI modules and explicit
Presentation adapters may import it. Existing formatter/projection functions used by Runtime or
Session move behind Presentation projectors or become domain-neutral helpers under their owner.

Alternative considered: move UI DTOs to a generic shared directory so every layer may import
them. Rejected because that preserves the dependency inversion under a neutral name.

### 6. Promote Execution Context to a Kernel ABI

`AsyncLocalStorage` propagation remains because it correctly isolates concurrent Agent cwd and
identity. Ownership moves from `agents/process` to `kernel/execution-context.ts`.

The generic context contains only cross-cutting Host/process identity and cwd, including a stable
`hostId` that prevents attribution collisions between Agent Host instances. AgentContext/PCB keeps
capabilities, Worktree metadata, Runtime and lifecycle state. AgentSupervisor adapts AgentContext
into ExecutionContext at Runtime entry. Driver, Logger and Checkpoint depend only on the Kernel ABI.
When no Agent context is bound, an Adapter uses its injected Host workspace fallback rather than
reading or changing the process cwd.

Alternative considered: inject cwd into every Tool call. Rejected for now because Pi Agent Tool
ABI and long asynchronous call chains make it invasive; a formal Kernel ABI preserves isolation
without coupling Drivers to Agent Process implementation.

### 7. Make Composition Root construct; make Harness coordinate

Composition is split into a reusable, side-effect-bounded Host factory and a CLI adapter:

```text
src/bootstrap/create-standard-agent-host.ts
  ├─ accept explicit workspace, environment snapshot and Host platform ports
  ├─ construct EventBus and ExecutionContext facilities
  ├─ construct storage/model/Driver/Integration/Service adapters
  ├─ construct Application coordinators and Harness facade
  └─ return AgentHost { id, api, start(), shutdown() }

src/bootstrap/cli-main.ts
  ├─ parse CLI arguments and process environment
  ├─ call createStandardAgentHost(...)
  ├─ select TUI or Web and bind UserInteractionPort
  └─ own signals, fatal handlers and process exit behavior
```

Harness no longer imports TuiBackend or uses a UI fallback. It receives dependencies and
coordinates lifecycle. Large workflows move into focused coordinators:

- `ConversationCoordinator`: Main Agent prompt/abort/retry and processing lifecycle;
- `SessionCoordinator`: save/load/switch and Main Process binding transaction;
- `ProjectCoordinator`: project-scoped settings, Skills, MCP, Integration and process context;
- `McpController`: MCP lifecycle, Driver contribution and state events;
- `AgentRuntimeCoordinator`: Main/SubAgent runtime construction and capability refresh;
- `SettingsService`: persisted settings commands and runtime snapshots.

Coordinators are not independent services or new state stores. Harness remains the internal
Application lifecycle coordinator; `AgentHost` is the construction result that owns one Harness
facade and every runtime-scoped resource.

Alternative considered: split Harness into many autonomous services with their own events and
state. Rejected because it would introduce duplicate ownership and distributed-state complexity.

### 8. Enforce boundaries with a TypeScript AST ratchet

Add a repository script using the existing TypeScript dev dependency to parse import and export
declarations. Rules are expressed as source classifications, forbidden targets and exact
Composition Root exceptions.

Migration begins with an explicit baseline of known violations. The check fails on new violations.
Each task removes baseline entries; completion requires zero compatibility violations and only
documented Composition Root exceptions. `typecheck`, focused tests and architecture checks run at
each phase.

Alternative considered: add dependency-cruiser or an ESLint boundaries plugin. Rejected initially
to avoid a dependency and configuration migration unrelated to runtime behavior.

### 9. Preserve behavior through contract and parity tests

Testing focuses on boundaries and behavior:

- compile-time fixtures prove allowed and forbidden imports/API access;
- SettingsRepository tests prove atomic scope patches and no lost unrelated fields;
- Application contract tests exercise commands/queries with fake ports;
- TUI/Web parity tests feed identical events/snapshots through projectors;
- Session compatibility tests load v1/v2/v3 data;
- Agent/Service/MCP lifecycle tests remain unchanged;
- package build and smoke tests verify bootstrap wiring.

No persistent data migration is required.

### 10. Preserve an SDK-ready Agent Host boundary without publishing an SDK

This change establishes the runtime boundary a future SDK can export, but does not designate the
current repository modules as public npm API.

Authoring and runtime identity are separated:

```text
AgentDefinition
  developer-authored, source-neutral, no digest/generation/runtime state
        │ compile + validate + resolve capabilities
        ▼
AgentApplicationSnapshot
  immutable executable image with source, digest and registry generation
        │ AgentSupervisor.spawn
        ▼
AgentProcess
```

Markdown Agent.md and programmatic definitions enter the same compiler and produce equivalent
snapshots. An Agent created programmatically receives the same standard Tool, Skill, Memory, MCP,
Permission, Session and SubAgent capability derivation as a file-defined Agent. Custom third-party
feature registration is deliberately deferred.

The standard dscode feature set is assembled by `createStandardAgentHost()`. CLI/TUI/Web use this
factory rather than a privileged parallel construction path, so a future SDK wrapper can expose the
same Host without rebuilding internal Managers. The factory accepts explicit Host inputs and does
not read CLI arguments, install signals, call `process.exit()`, mutate `process.env`, or call
`process.chdir()`.

Mutable state that can affect behavior is Host-owned: EventBus, config snapshot, Agent Process
Table, Session/Process stores, registries, permission state, checkpoints, invalidation queues,
undo state, caches and managed services. Module-level immutable constants and proven stateless
helpers remain allowed. Process environment compatibility is captured as a read-only input snapshot
at Host construction. Project switching changes the Host workspace and Execution Context defaults,
not the Node.js process cwd.

The future public SDK may wrap or selectively export these contracts under SemVer. This change
therefore keeps Application commands, queries, events, AgentDefinition and lifecycle results free
of Presentation implementations and concrete Manager references, but it does not freeze their
package names or declare them public.

Alternative considered: publish the current Harness and AgentApplication classes directly.
Rejected because current source metadata, runtime generation, Node process side effects and
concrete Manager dependencies are implementation details that would make compatibility and
multi-instance embedding unsafe.

## Risks / Trade-offs

- **[Large cross-cutting diff]** → Use staged migrations, compatibility re-exports and a boundary
  ratchet; each phase must build and test independently.
- **[Facade becomes another god interface]** → Split methods into capability ports and aggregate
  only at the Presentation boundary.
- **[Snapshot copying adds overhead]** → Config/catalog snapshots are small; prefer structural
  sharing internally while preserving external immutability.
- **[Event payload migration breaks UI ordering]** → Preserve event identity/order and add parity
  fixtures before moving projectors.
- **[Settings commands lose a concurrent update]** → Centralize atomic scoped patching and test
  serialized concurrent mutations.
- **[Project switch exposes mixed scope]** → Prepare target resources before commit and publish
  only one committed snapshot.
- **[Compatibility re-exports become permanent]** → Architecture check rejects new imports and
  final tasks remove the baseline and re-export module.
- **[Too many coordinators obscure flow]** → Coordinators own transactions, not independent state;
  Harness and Composition Root remain the two navigation points.
- **[Existing specs encode old architecture]** → Delta specs replace Service Locator and direct UI
  orchestration requirements before implementation.
- **[SDK readiness expands this refactor into SDK product work]** → Implement only reusable Host,
  instance isolation and definition/snapshot separation; defer package exports, SemVer and custom
  Feature SPI to a dedicated future change.
- **[Removing process globals increases constructor surface]** → Group platform inputs into narrow
  Host options/ports and keep process inspection in the CLI adapter.

## Migration Plan

1. Add AST architecture check, classifications, current-violation baseline and CI script.
2. Move owner-defined types from `core/types.ts`; retain re-exports and migrate production imports.
3. Introduce Kernel Execution Context and migrate Driver/Logger/Checkpoint callers.
4. Introduce SettingsRepository, SettingsService and immutable RuntimeConfigStore; migrate
   Permission, UI settings commands and project settings writes.
5. Move Integration config resolution into IntegrationRegistry/OpenDesignIntegration and remove
   concrete Integration config from HarnessConfig.
6. Introduce capability-oriented HarnessAPI Commands/Queries; migrate Slash Commands and Eval.
7. Migrate TUI/Web to queries and snapshots, removing direct Agent/Manager/ConfigWatch access.
8. Move domain-to-UI transformations into Presentation projectors; remove UI imports from Session,
   Agent Runtime, Core Events, Eval and MCP.
9. Extract Session, Project, MCP and Agent Runtime coordinators from Harness.
10. Separate AgentDefinition from compiled snapshots and accept programmatic definitions through
    the same compiler and capability derivation path.
11. Extract `createStandardAgentHost()` with Host-owned state; move UI selection, environment
    capture, signals, cwd defaults and process exit behavior into the CLI adapter.
12. Add multi-Host isolation tests and remove process-global mutable runtime state.
13. Remove compatibility re-exports and architecture baseline entries; update architecture docs.
14. Run typecheck, full unit tests, package build, TUI smoke, Web smoke and OpenSpec strict validation.

Rollback is source-level per phase. Because formats and protocols do not change, reverting a phase
requires no data rollback. A phase that introduces a new facade keeps the old adapter only until
all consumers migrate within that phase.

## Open Questions

- None blocking. Target ownership, API shape, settings flow, projection boundary, context ABI and
  migration order are defined above.
