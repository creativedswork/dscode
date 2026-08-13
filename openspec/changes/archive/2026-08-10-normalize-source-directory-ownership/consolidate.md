## 变更综述

dscode 的 EventBus、Logger、Web adapter、`@file`、Slash Command 和 Open Design
能力是在不同阶段逐步加入的，各自解决了真实问题，但源码长期沿用 `core/`、`utils/`
和双重 `application/` 等早期路径。Headless Agent Host 与 Command/Query/Event
边界建立后，这些路径已不再表达真实所有权。本次变更完成物理目录收敛：Bootstrap
负责 concrete composition，Application 负责用例协调，Kernel 保存基础原语，各
Feature、Adapter、Persistence 和 Presentation 拥有自己的实现与契约；同时以
owner-aware 架构检查防止 catch-all 目录和运行时类型例外重新出现。

## 变更时间线

- 2026-01-16: `harness-event-bus` — 引入统一事件总线，开始解除 Harness 与 TUI/Web 的直接调用。
- 2026-01-16: `logging-system` — 建立文件 Logger，但最初放入通用 `src/utils/`。
- 2026-05-19: `web-ui` — 增加 Web Presentation adapter，形成 TUI/Web 双后端。
- 2026-05-28: `at-file-input` — 增加双端 `@file` 能力，但解析逻辑最初归入 `utils/`。
- 2026-06-01: `code-maintainability-refactor` — 引入 HarnessAPI、共享图片链路和 Slash Command UI port。
- 2026-07-03: `custom-commands` — 增加自定义 command loader/manager，形成 `commands/` 与 `ui/commands.ts` 双 owner。
- 2026-08-09: `decouple-open-design-from-core` — 将 Open Design 行为移出 Core，并建立 ServiceSupervisor。
- 2026-08-10: `normalize-source-directory-ownership` — 统一所有源码 owner、删除 catch-all 路径并收紧架构检查。

## 初始设计

早期架构以 `src/core/` 作为 Harness、配置、事件和 CLI 的集中入口，以
`src/utils/` 保存 Logger 与项目文件解析；TUI 实现平铺在 `src/ui/`。新增 Web UI
后，HarnessEventBus 和 HarnessAPI 逐步形成了可复用的 Headless 边界，但目录没有
同步演进。Custom Commands 进一步把 manifest 管理放入 `src/commands/`，内建
dispatch 则继续位于 `src/ui/commands.ts`。

这些设计的共同目标是快速建立能力并复用 Harness 行为：

- EventBus 为 TUI/Web 提供相同事件；
- HarnessAPI 隔离 UI 与 Manager；
- `@file` 为两端提供统一项目文件上下文；
- Custom Commands 提供轻量 prompt 模板；
- Open Design 通过 MCP 和受管服务接入外部设备。

随着边界成熟，早期目录从“实现位置”变成了误导性的 catch-all，无法继续作为最终
ownership 模型。

## 变更记录

### 变更: Core 从中心目录收敛为 Bootstrap、Application 与 Config
- **触发**: `core/` 同时承载 CLI、配置、事件和 Harness，且与现有
  `application/`、`kernel/` 语义重叠。
- **改动**: CLI 直接使用 `bootstrap/cli-main.ts`；配置进入 `config/loader.ts`；
  Harness 与 EventBus 进入 `application/`；删除 Core 兼容入口。
- **影响**: concrete composition、用例协调和基础原语具有独立路径，不再保留
  `src/core/`。

### 变更: Agent authoring 与 Application layer 分离
- **触发**: `src/application/` 与 `src/agents/application/` 使用同一个
  “application” 词表达不同概念。
- **改动**: Agent authoring、compiler、schema、registry 和 package resources
  迁入 `src/agents/definitions/`。
- **影响**: `AgentApplication` 领域名、Agent.md precedence、digest、generation
  和 process launch 行为保持不变。

### 变更: Slash Command 与 Project File 获得独立 Feature owner
- **触发**: 内建/自定义命令被 UI 和 `commands/` 分割；项目文件解析与附件 staging
  分别位于 `utils/` 和 Presentation。
- **改动**: Slash Command 的 builtins、loader、manager、context 和 Presenter
  port 合并到 `slash-commands/`；解析与附件 staging 合并到 `project-files/`。
- **影响**: TUI/Web 复用相同 runtime API，不引入每命令 Handler 或 Registry。

### 变更: Presentation adapter 按实际消费者归组
- **触发**: TUI-only 文件平铺在 `ui/`，共享模型与 adapter implementation 的路径
  无法区分。
- **改动**: TUI app、backend、conversation、image、MCP browser 和 theme 进入
  `ui/tui/`；Web 保持 `ui/web/`；双端 projector/reducer/model 保持 `ui/shared/`。
- **影响**: 无视觉、交互和 wire protocol 变化。

### 变更: Open Design 单实现 contract 下沉
- **触发**: 删除 IntegrationRegistry 后仍残留泛型 settings/type 层，但只有
  Open Design 一个生产使用者。
- **改动**: settings source 与 runtime override contract 进入
  `integrations/open-design/`，Bootstrap 直接调用 preparation API。
- **影响**: ServiceSupervisor 继续拥有真实的多服务生命周期；不提前建立第二个
  Integration SPI。

### 变更: Skill 与 MCP 保持 sibling owner
- **触发**: UI 将二者展示在同一 Capabilities 分组，容易误导源码也应合并。
- **改动**: `skills/` 继续拥有 instructions、activation 和 Tool allowlist；
  `mcp/` 继续拥有 JSON-RPC、transport、连接、重连和 Driver contribution。
- **影响**: 不创建 `capabilities/`、共享 lifecycle、基类或统一 Registry。

## 修复记录

### 修复: 零违规基线无法发现未知 owner
- **症状**: 未识别的 `src/*` 目录会被静默归类为 Feature，错误路径仍能通过检查。
- **根因**: 架构分类使用 catch-all fallback。
- **修复**: 显式列出全部 source root；unknown root、`src/core/` 和 `src/utils/`
  均成为失败项，并保持 baseline 为零。

### 修复: `types.ts` 文件名可绕过运行时依赖规则
- **症状**: value import 只要目标名为 `types.ts` 就可能获得 owner-contract 例外。
- **根因**: import 分析丢失 `import type` 和 type-only specifier 元数据。
- **修复**: AST 扫描保留 type-only 信息，只有纯类型导入可使用 contract 例外。

### 修复: 分段构造的旧 build entry 未被普通文本迁移发现
- **症状**: 源码、测试和 package scripts 已迁移，但完整 build 仍解析
  `src/core/main.ts`。
- **根因**: build script 使用 `resolve(rootDir, "src", "core", "main.ts")` 分段构造路径。
- **修复**: build entry 改为 `src/bootstrap/cli-main.ts`，仓库断言同时检查旧模块
  字符串和分段 build path。

## 最终状态

### Why

Headless Agent Host、Command/Query/Event 应用边界和 owner-defined contracts 已经
建立，但物理目录仍保留旧分层痕迹。目录与真实所有权不一致，使新代码容易重新落入
catch-all 目录，也让架构检查在零违规时无法发现语义错位。

### What Changes

- `src/agents/application/` 重命名为 `src/agents/definitions/`，领域类型与行为不变。
- 删除 `src/core/`：配置归 Config，Harness/EventBus 归 Application，CLI 归 Bootstrap。
- 删除 `src/utils/`：路径安全与 Logger 归 Kernel，项目文件能力归
  `src/project-files/`。
- 内建与自定义 Slash Command 统一归 `src/slash-commands/`。
- TUI 归 `src/ui/tui/`，共享 projector/model 保持 `src/ui/shared/`，Web 保持
  `src/ui/web/`。
- Open Design settings/type 归 `src/integrations/open-design/`，不建立泛型 SPI。
- Skill 与 MCP 保持独立 sibling owner。
- 架构检查拒绝 unknown root、Core/Utils catch-all 和 value-import contract 绕过。
- 测试、构建入口、OpenSpec、README 与架构文档全部使用最终路径，不保留兼容 re-export。

### Capabilities

#### New Capabilities

- `source-directory-ownership`: 定义源码目录唯一 owner、依赖方向、禁止的 catch-all
  目录，以及 Agent Definition、Slash Command、Project File、Skill 和 MCP 边界。

#### Modified Capabilities

- `core-harness`: Bootstrap 是 concrete composition root，Harness 是 Application
  lifecycle 与用例 coordinator。
- `slash-command-context`: Slash Command 通过 HarnessAPI 与 owner-defined
  Presenter port 工作，不依赖 concrete TUI/Web。
- `cli-cwd-flag`: CLI 与配置加载规范路径更新为 Bootstrap 与 Config owner。
- `architecture-documentation`: 目录树、owner matrix、启动流和依赖图与自动检查一致。

### Impact

- 内部 TypeScript import path 全面变化，不提供旧路径兼容层。
- CLI 参数、配置文件、Agent.md、Session schema、MCP protocol、TUI/Web 行为和
  HarnessAPI runtime contract 保持不变。
- 不增加运行时依赖，不引入 DI framework、Factory、Registry 或顶层 capability
  聚合目录。
- 架构检查、TypeScript、810 项非 live 单测、CLI/Web/release build、tgz package
  verification 及 TUI/Web smoke 均通过；外部模型 live test 仍按环境开关执行。
