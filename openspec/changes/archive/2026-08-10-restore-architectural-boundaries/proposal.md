## Why

dscode 的目录已经表达 Kernel、Agent Process、Driver、Integration、Service Process、
Persistence 与 Presentation 等不同职责，但这些边界尚未成为可编译、可验证的契约。
`core/types.ts`、`HarnessAPI` 和 `Harness` 逐渐成为具体类型仓库、Service Locator 与
集中编排器，使新增设备或 UI 功能必须修改 Core，并允许 Presentation 直接改变 Agent、
Manager 和配置内部状态。相同问题也会阻止未来 SDK 复用 dscode 的标准 Agent 能力：
当前 CLI 是唯一 Composition Root，运行时仍可修改进程级 cwd/env 并持有模块级可变状态，
开发者无法在同一进程安全构造独立 Agent Host。

## What Changes

- 建立可自动验证的模块所有权和依赖方向规则，明确 Composition Root 是唯一允许组装
  具体实现的入口。
- 将 `core/types.ts` 中的 Driver、Skill、Command、Memory、Permission、Vision、
  Integration 等类型迁回各自所有者；Core 不再充当跨领域类型仓库。
- **BREAKING (internal API)**：将 `HarnessAPI` 从公开 Agent/Manager/ConfigWatch 的
  Service Locator 改为只暴露 Commands、Queries、Events 和不可变 Snapshot 的应用端口。
- 引入统一 `SettingsRepository` / `SettingsService` 边界。配置文件继续作为 SSoT，
  UI、Permission 和 Integration 不再直接读写 Core 配置函数或可变配置对象。
- 让每个 Integration 拥有自己的 typed 配置、解析、校验和兼容输入；`HarnessConfig`
  不再枚举 `openDesign` 等具体设备类别。
- 将 Session/Agent/Eval/MCP 的领域事件和持久化快照与 UI DTO、formatter、projection
  分离；TUI/Web Adapter 负责把应用事件投影为共享展示模型。
- 将 Agent 执行上下文提升为 Kernel ABI，使 Driver、Logger、Checkpoint 等通过通用
  Execution Context 归因，而不是依赖 `agents/process` 的具体实现目录。
- 将 `Harness` 收敛为生命周期和用例协调器；组件构造、UI 选择和具体 Integration
  注册移至 Composition Root，项目切换、MCP、Session、Agent Runtime 等复杂流程拆入
  有明确事务边界的 Coordinator。
- 增加 SDK Readiness 约束：分离开发者可声明的 `AgentDefinition` 与内部编译快照，
  提供无 CLI 副作用的标准 Agent Host 构造入口，将所有运行时可变状态限定在 Host
  实例内，并让 CLI/TUI/Web 使用同一标准 feature composition。
- 保留现有 CLI、TUI、Web、配置文件、Session 文件和 MCP 行为；迁移期间允许受控的
  type re-export，但禁止新增对兼容入口的依赖。

## Capabilities

### New Capabilities

- `module-boundary-contracts`: 定义类型所有权、允许/禁止依赖、Composition Root 例外、
  兼容迁移规则和自动化架构检查。
- `settings-service-boundary`: 定义分作用域配置仓库、typed feature resolver、安全 patch、
  运行时 snapshot 和配置变更事件的统一边界。
- `runtime-presentation-boundary`: 定义领域事件、持久化快照、Presentation DTO 与
  TUI/Web projector 之间的单向依赖。
- `agent-sdk-readiness`: 定义可复用 Agent Host、AgentDefinition 编译边界、标准
  feature parity、实例隔离和 CLI 进程副作用边界，为未来 SDK 提供稳定演进基础。

### Modified Capabilities

- `harness-api`: 从具体 Manager Service Locator 改为窄化的 Command/Query/Event 端口。
- `core-harness`: 从组件构造和 UI/MCP/Session 集中实现收敛为应用生命周期协调器。
- `config-watch`: 从共享可变 `HarnessConfig` 引用改为内部不可变 runtime snapshot store。
- `harness-event-bus`: 保持 typed event bus，但事件 payload 由领域所有者定义且不依赖 UI。
- `ui-backend-slim`: UI Backend 只消费应用端口、事件和 Presentation snapshot。
- `slash-command-context`: Slash Command 使用应用 Commands/Queries 与 Presenter，不访问 Manager。
- `shared-conversation-model`: 共享 conversation model 明确为 Presentation model，只由 projector 生成。
- `open-design-env-config`: Open Design Integration 自己解析 typed settings；Core 不持有具体配置类型。
- `agent-context`: 将进程执行上下文定义为 Kernel Execution Context ABI，Agent 负责绑定而非拥有 ABI。
- `image-session`: Session image/Agent 记录保持 presentation-neutral，不引用 UI DTO。
- `permission-project-persist`: Permission 规则仍写项目 settings，但通过 SettingsService port 持久化。
- `session-management`: Session 切换与保存顺序由应用用例协调，Web/TUI Adapter 不直接编排 Manager。
- `architecture-documentation`: 架构文档增加可执行的依赖规则、所有权表和 OS 边界说明。

## Impact

- **Core/Application**: `src/core/types.ts`、`harness-api.ts`、`harness.ts`、`events.ts`、
  `config.ts`、`config-watch.ts` 和 `main.ts`。
- **Feature owners**: `src/agents/`、`drivers/`、`session/`、`permissions/`、`memory/`、
  `skills/`、`commands/`、`mcp/`、`integrations/`、`services/`、`eval/`。
- **Presentation**: `src/ui/`、`src/ui/shared/`、TUI/Web adapters 与 Slash Command context。
- **Tests/tooling**: 新增静态 import-boundary 检查、contract tests、TUI/Web parity tests，
  多 Host 隔离测试，并更新依赖 `HarnessAPI` concrete managers 的测试 fixtures。
- **Specifications**: 修改现有 Service Locator、ConfigWatch 和 UI/persistence ownership
  要求，使规格与目标分层一致。
- **Compatibility**: 无用户配置格式、CLI 参数、Session schema 或 wire protocol 破坏；
  内部 TypeScript import path 和构造 API 属于 breaking change。
- **SDK scope**: 本变更不发布 npm SDK、不承诺 public SemVer，也不开放任意第三方
  Feature/Driver plugin SPI；这些建立在本变更产出的 Agent Host 边界之上另行提案。
- **Dependencies**: 优先使用 TypeScript AST 编写仓库内检查脚本，不要求新增运行时依赖。
