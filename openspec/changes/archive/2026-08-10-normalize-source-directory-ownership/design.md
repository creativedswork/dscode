## Context

`restore-architectural-boundaries` 已经把运行时架构收敛为 Headless `AgentHost`、
Command/Query/Event `HarnessAPI`、Host-scoped state 和 owner-defined contracts。
当前剩余问题主要位于物理源码结构：

- `src/core/` 被架构检查归类为 Application，但同时包含配置加载、事件、Harness
  和两行兼容入口，没有统一 owner。
- `src/application/` 表示 Clean Architecture Application Layer，
  `src/agents/application/` 则表示领域概念 `AgentApplication`，路径无法区分两种含义。
- `src/commands/` 保存自定义 Slash Command manifest，内建 Slash Command 却位于
  `src/ui/commands.ts`，一个能力被拆到 Feature 和 Presentation 两个 owner。
- `src/utils/` 中的 Logger 依赖 Kernel Execution Context，`at-file-resolver.ts`
  则是完整的项目文件能力；二者都不是无状态通用工具。
- `src/ui/shared/file-attachments.ts` 执行文件复制和 sandbox 判断，不是
  Presentation model。
- `src/integrations/types.ts` 和 `settings-source.ts` 是删除
  `IntegrationRegistry` 后留下的单实现泛型层。
- 架构检查将所有未识别的 `src/*` 目录归为 `feature`，并仅根据文件名
  `types.ts` 放宽跨层依赖，因此零违规不等于 owner 正确。

本变更是内部源码迁移。`settings.json`、Agent.md、Session、MCP、CLI、TUI/Web
协议和用户可见行为均为兼容约束。迁移后不保留旧 import path。

## Goals / Non-Goals

**Goals:**

- 让一个源码路径只表达一个架构含义，消除 `core`、`utils` 和双重
  `application` 歧义。
- 让 Application、Kernel、Feature、Adapter、Persistence 和 Presentation 的
  物理目录与架构检查分类一致。
- 让 Agent Definition、Slash Command、Project File、Skill 和 MCP 各自拥有类型、
  加载、运行和测试代码。
- 让架构检查拒绝重新创建 catch-all 目录，并验证 owner contract 例外是
  type-only 依赖。
- 保持运行行为、公开协议、持久化 schema 和配置 SSoT 不变。

**Non-Goals:**

- 不把 `skills/` 与 `mcp/` 合并为 `capabilities/`、`plugins/` 或 `extensions/`。
- 不引入 DI framework、Handler Registry、Integration SPI、Factory 或 Facade。
- 不因文件行数机械拆分 Harness、Web Backend 或 Eval Dashboard。
- 不改变 HarnessAPI、Agent Process、MCP transport、Skill 激活或 UI 交互语义。
- 不在本变更中创建通用 `artifacts/` 或 `transcript/` owner；相关文件只有在职责
  和调用流一起迁移时另行提案。
- 不发布新的公共 npm API，也不承诺内部 import path 的 SemVer 兼容。

## Decisions

### 1. Remove `core/` instead of redefining it

目标路径：

```text
src/core/config.ts   -> src/config/loader.ts
src/core/events.ts   -> src/application/events.ts
src/core/harness.ts  -> src/application/harness.ts
src/core/main.ts     -> removed
```

`src/bootstrap/cli-main.ts` 已是唯一 CLI 入口，`core/main.ts` 只是兼容转发。
配置加载属于现有 `config/` owner；事件和 Harness 属于 Application 用例协调。
迁移后 `src/core/` 不存在，架构检查显式拒绝恢复该目录。

保留 `core/` 并将其解释为 Application 的替代方案被拒绝，因为项目已经有
`kernel/` 和 `application/`，第三个中心层只会继续吸收无 owner 代码。

### 2. Reserve top-level `application/` for use-case coordination

顶层 `src/application/` 只保存：

- `HarnessAPI` Command/Query/Event ports；
- `AgentHost` contract；
- Harness lifecycle facade；
- Conversation、Session、Project、MCP 和 Runtime coordinators；
- Application event composition。

`src/agents/application/` 重命名为 `src/agents/definitions/`：

```text
src/agents/definitions/
├── compiler.ts
├── frontmatter.ts
├── memory.ts
├── package-resources.ts
├── registry.ts
├── schema.ts
└── types.ts
```

TypeScript 名称 `AgentDefinition`、`AgentApplication`、
`AgentApplicationRegistry` 和磁盘目录 `.dscode/agents/` 保持不变。这里调整的是
源码 owner，不是领域语言。

将顶层目录改名为 `use-cases/` 的替代方案被拒绝，因为 `application/` 已与
Command/Query/Event 架构和现有文档一致。

### 3. Keep Skill and MCP as sibling capabilities

`skills/` 负责声明式 SKILL.md 扫描、解析、激活和 Tool allowlist。
`mcp/` 负责 JSON-RPC、transport、连接、重连、Server state 和动态 Driver 注册。
两者的生命周期、失败模型和配置来源不同，只在 Tool/Driver contracts 上协作。

因此二者保持顶层 sibling：

```text
src/skills/
src/mcp/
src/drivers/
```

不增加 `capabilities/` 父目录，也不抽取 Skill/MCP 公共基类或 Registry。
UI 可以把它们展示在同一信息分组中，但 Presentation taxonomy 不决定源码 owner。

### 4. Give Slash Command one feature owner

现有 `src/commands/` 与 `src/ui/commands.ts` 合并为：

```text
src/slash-commands/
├── builtins.ts
├── loader.ts
├── manager.ts
└── types.ts
```

`types.ts` 拥有 `CommandManifest`、`SlashCommandContext`、
`SlashCommandPresenter` 和命令定义。TUI/Web 实现 Presenter port，并调用统一的
`executeSlashCommand()`。Slash Command 不依赖 TUI/Web concrete backend。

不为每条命令建立类、文件或 Handler Registry。当前数组和函数分派足以表达静态
内建命令集合。

### 5. Establish `project-files/` as the file-reference owner

目标路径：

```text
src/utils/at-file-resolver.ts
  -> src/project-files/resolver.ts

src/ui/shared/file-attachments.ts
  -> src/project-files/attachments.ts
```

该 owner 负责 `@file` 解析、文件类型识别、大小限制、显式附件 staging 和
project sandbox containment。TUI、Web、Harness 和 Agent Tools 依赖该 feature，
不再把文件 I/O 放在 Presentation 或 `utils`。

`src/application/path-safety.ts` 迁至 `src/kernel/path-safety.ts`，因为 canonical
containment 是 Driver、Project File、Agent capability 和 Web static serving
共同依赖的安全原语。`src/utils/logger.ts` 迁至 `src/kernel/logger.ts`，继续通过
Execution Context 完成 Host/Agent 归因。

### 6. Group Presentation adapters without changing Presentation contracts

目标结构：

```text
src/ui/
├── backend.ts
├── shared/
├── tui/
│   ├── app.ts
│   ├── backend.ts
│   ├── activity-inspector.ts
│   ├── permission-input.ts
│   ├── conversation.ts
│   ├── image-manager.ts
│   ├── image-paste-handler.ts
│   ├── mcp-browser.ts
│   └── theme.ts
└── web/
```

`ui/shared/` 仅保留 TUI/Web 共用的 Presentation model、projector、reducer 和纯展示
helper。是否移动某个文件由实际 importers 决定，不按文件名批量搬迁。

TUI 文件归组不属于 UI 设计变更，不需要 HTML prototype。

### 7. Collapse single-implementation Integration abstractions

以下文件下沉：

```text
src/integrations/types.ts
  -> src/integrations/open-design/types.ts

src/integrations/settings-source.ts
  -> src/integrations/open-design/settings.ts
```

若现有 `open-design/types.ts` 已拥有同名职责，则合并而不是创建重复文件。
Bootstrap 直接调用 Open Design preparation API；`ServiceSupervisor` 继续作为真实的
多服务生命周期边界。

当出现第二个生产 Integration 且共享契约由两个实现证明后，再提取通用 SPI。

### 8. Make architecture classification owner-aware

架构工具增加显式 source roots：

| Root | Classification | Key constraint |
|------|----------------|----------------|
| `bootstrap/` | Bootstrap | only exact composition files wire concrete layers |
| `kernel/` | Kernel | no outward project dependency |
| `application/` | Application | use owner ports, not concrete adapters |
| `agents/`, `skills/`, `mcp/`, `slash-commands/`, `project-files/` | Feature | no Presentation dependency |
| `drivers/`, `integrations/`, `services/` | Adapter | no Presentation dependency |
| `session/store.ts`, `agents/process/store.ts`, `checkpoint/` | Persistence | owner contracts and Kernel only |
| `ui/` | Presentation | Application ports, Kernel contracts and Presentation only |

检查器 SHALL：

1. 在扫描源码时拒绝任何 `src/core/**` 和 `src/utils/**` 文件；
2. 不再把未知顶层目录静默归为 Feature，而是报告未分类 owner；
3. 只在 AST import declaration 使用 `import type` 或每个 specifier 均为 type-only
   时放宽 owner contract 依赖；
4. 删除 `src/core/main.ts` composition exception；
5. 用新路径更新 fixture，并保持 baseline 为零。

仅按 `types.ts` 文件名信任契约的替代方案被拒绝，因为 value import 仍可在运行时建立
错误依赖。

### 9. Use direct migration without compatibility re-exports

每个 owner 批次原子完成：

```text
move source -> update all production imports -> update tests -> run checks
```

不在旧路径留下 `export *` shim。旧路径没有 public package export，兼容层只会让迁移
长期停在双 owner 状态。Git 能保留文件历史，运行时不需要路径重定向。

## Risks / Trade-offs

- **[Risk] 大量 import path 变化产生短期合并冲突** → 按 owner 分批迁移，每批运行
  typecheck 和定向测试，不与行为重构混合。
- **[Risk] TUI 归组时误把共享 projector 搬入 TUI** → 根据 TUI/Web importer 集合判断，
  双方使用的 Presentation 文件保留在 `ui/shared/`。
- **[Risk] `project-files/` 迁移触碰路径安全行为** → 仅移动和改 import，保留既有
  traversal、symlink、文件大小和附件测试。
- **[Risk] 架构规则升级暴露已有未知 owner** → 先输出完整分类清单，再启用
  unknown-root failure；不使用新 baseline 掩盖问题。
- **[Trade-off] Harness 仍是大文件** → 本变更只纠正 owner。按职责继续拆 Harness
  需要行为证据和独立提案，不能用目录迁移伪装分解。
- **[Trade-off] `artifact-theme.ts` 等小型共享文件可能暂时留在 Application** →
  避免为单个 helper 创建空泛 owner；后续应随 Artifact renderer 调用流一起迁移。

## Migration Plan

1. 先扩展架构分类测试，使目标路径可识别，但暂不启用旧目录拒绝。
2. 迁移 Kernel 与 Project File owner，更新安全和附件定向测试。
3. 迁移 Agent Definition 与 Slash Command owner，更新 Application/Presentation
   contract tests。
4. 归组 TUI 文件，下沉 Open Design 单实现 contracts。
5. 迁移 Config、Events 和 Harness，删除 `core/main.ts` 及整个 `core/`、`utils/`。
6. 启用 unknown-root、forbidden catch-all 和 type-only contract 检查。
7. 更新 OpenSpec、`docs/ARCHITECTURE.md`、构建入口和所有测试路径。
8. 运行架构检查、typecheck、全量测试、Web build、package build 和 CLI/TUI/Web smoke。

回滚以 owner 批次为单位执行普通 Git revert。迁移不修改持久化数据或 wire protocol，
不需要运行时数据回滚。

## Open Questions

无阻断问题。`artifact-theme.ts` 和 `tool-result-text.ts` 的最终 owner 明确留给后续有
真实职责迁移需求的 change，本变更不为消除最后两个小文件而创造新抽象。
