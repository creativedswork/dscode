## Why

上一轮架构边界重构已经建立 Headless Agent Host、Command/Query/Event 应用边界和
owner-defined contracts，但物理目录仍保留旧分层痕迹：`src/core/` 混合配置加载、
事件和 Harness，`src/application/` 与 `src/agents/application/` 名称冲突，
Slash Command 与项目文件能力分散在 UI 和 `utils/` 中。目录和真实所有权不一致，
使新代码容易重新落入 catch-all 目录，也让当前架构检查在零违规时仍无法发现语义错位。

## What Changes

- **BREAKING (internal imports)**：将 `src/agents/application/` 重命名为
  `src/agents/definitions/`。`AgentApplication` 领域类型和运行行为保持不变。
- 消除无一致职责的 `src/core/`：配置加载归 `src/config/`，Harness 和事件归
  `src/application/`，CLI 直接使用 `src/bootstrap/cli-main.ts`。
- 消除 `src/utils/`：路径安全和日志归 Kernel，`@file` 解析归新的
  `src/project-files/` feature owner。
- 将自定义 Slash Command manifest 与内建命令执行统一到
  `src/slash-commands/`，不引入每命令 Handler 类或新的 Registry。
- 将平铺的 TUI 实现归组到 `src/ui/tui/`，保留 `src/ui/shared/` 和
  `src/ui/web/`；不改变可见 UI、交互或 wire protocol。
- 将仅服务 Open Design 的泛型 Integration settings/type 残留下沉到
  `src/integrations/open-design/`，不提前设计第二个 Integration SPI。
- 保持 `src/skills/` 与 `src/mcp/` 为独立 owner；不创建
  `capabilities/`、`extensions/`、共享生命周期或统一 Registry。
- 增强架构检查，使其识别目标 owner、拒绝重新创建 `core/` 和 `utils/` catch-all，
  并验证跨 owner 的 `types.ts` 例外确实只包含 type-only 依赖。
- 同步架构文档、OpenSpec 路径要求、测试和构建入口；不保留旧路径兼容 re-export。

## Capabilities

### New Capabilities

- `source-directory-ownership`: 定义源码目录的唯一 owner、允许的依赖方向、禁止的
  catch-all 目录，以及 Skill、MCP、Slash Command、Agent Definition 和
  Project File 的边界。

### Modified Capabilities

- `core-harness`: 明确 Bootstrap 是 concrete composition root，Harness 位于
  Application 层并只负责生命周期和用例协调。
- `slash-command-context`: 将 Slash Command 实现路径从 UI owner 调整为独立
  `slash-commands` feature owner，继续通过 HarnessAPI 与 Presenter 交互。
- `cli-cwd-flag`: 将 CLI 与配置加载的规范路径更新为 Bootstrap 和 Config owner。
- `architecture-documentation`: 要求目录树、组件清单和依赖图与当前实现及架构检查一致。

## Impact

- **Source paths**: `src/core/`、`src/application/`、`src/agents/application/`、
  `src/commands/`、`src/utils/`、`src/ui/`、`src/integrations/` 及其消费者。
- **Internal API**: TypeScript import path 全面变化；不提供旧路径兼容层。
- **Behavior compatibility**: CLI 参数、配置文件、Agent.md、Session schema、MCP
  protocol、TUI/Web 行为和 HarnessAPI runtime contract 均保持不变。
- **Tooling**: 架构检查、构建入口、测试 import、文档链接和 OpenSpec 路径要求需要同步。
- **Dependencies**: 不增加运行时依赖，不引入 DI framework、Factory、Registry 或
  顶层 `capabilities/` 聚合目录。
