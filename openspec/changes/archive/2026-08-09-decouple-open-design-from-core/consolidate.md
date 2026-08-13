## 变更综述

Open Design 集成最初为解决 daemon 必须手工启动的问题而进入 `core/main.ts`，随后补充了禁止自动打开浏览器、daemon 异常重启和 MCP 自动重连。随着职责增加，Open Design 的产品配置、子进程监管和 MCP 文件同步逐渐集中在 core，形成专用启动路径和重复配置源。本次变更将最终形态收敛为 OS 风格分层：Open Design 是外部虚拟设备，MCP 是 Driver，OD daemon 是用户态设备服务进程；通用 `ServiceSupervisor` 监管 dscode 自己启动的外部服务，`IntegrationRegistry` 负责配置、服务声明和 MCP 内存贡献，core 只保留组合职责。

## 变更时间线

- 2026-07-27: `add-open-design-daemon-auto-start` — 增加 `--with-od`、环境变量配置、daemon 自动启动/清理和 `~/.mcp.json` 自动同步。
- 2026-07-27: `suppress-od-browser-auto-open` — 为两条 OD 启动命令补充 `--no-open`，避免干扰用户工作流。
- 2026-07-27: `mcp-connection-resilience` — 将 MCP Driver 重连与 OD daemon 重启拆成独立恢复机制，并为 daemon 增加异常重启。
- 2026-08-08: `decouple-open-design-from-core` — 引入受管服务进程与 Integration 分层，移除 Open Design 对 core 和持久 MCP 文件的侵入。

## 初始设计

最初的问题是 Open Design daemon 必须在另一个终端手工执行 `pnpm tools-dev run web`，探索模式无法即时使用设计能力。初始方案直接在 CLI bootstrap 中增加一条产品专用路径：

- `.env` 使用 `OPEN_DESIGN_DIR` 和 `OD_PORT` 描述本机安装位置；
- `--with-od` 触发 daemon 子进程启动；
- 启动后轮询健康端点，dscode 退出时执行 SIGTERM，超时后 SIGKILL；
- 根据环境变量自动创建或刷新 `~/.mcp.json` 的 `open-design` 条目；
- Open Design 启动失败不阻塞 dscode 主流程。

该方案快速消除了手工启动摩擦，但把设备配置、服务生命周期、MCP 配置同步和 Harness bootstrap 放在了同一个模块边界。

## 变更记录

### 变更: 禁止 Open Design 自动打开浏览器
- **触发**: daemon 每次启动都会打开独立浏览器标签页，而 dscode 已通过 TUI/Web 和 MCP 使用其能力。
- **改动**: project-local `od` 和 pnpm fallback 两条命令统一传入 `--no-open`。
- **影响**: 保留 daemon 能力和预览 URL，不再打断用户当前界面。

### 变更: 将 daemon 恢复与 MCP Driver 恢复解耦
- **触发**: MCP 连接断开后状态失真，OD daemon 异常退出后也无法继续提供能力。
- **改动**: MCPManager 独立负责 MCP Client 重连和 session 恢复；`main.ts` 独立负责 OD daemon 异常重启。
- **影响**: 明确 daemon 不是 MCP 概念，但仍把具体 daemon 生命周期留在了 core。

### 变更: 引入 Managed Service Process
- **触发**: Open Design 专用生命周期代码扩展到健康检查、所有权、重启、日志和关闭后，core 无法继续保持通用 Harness 边界。
- **改动**: 新增 `ServiceSupervisor`，统一管理可信 Integration 声明的外部服务进程，并区分 owned 与 external 服务。
- **影响**: 外部 daemon 不再进入 `AgentSupervisor` Process Table；Agent Process 与 Service Process 拥有独立模型和监管器。

### 变更: Open Design 改为外部设备 Integration
- **触发**: Open Design 既包含 daemon 服务声明，也包含 MCP Driver 配置，不能简单归入 Driver 或 core。
- **改动**: 新增 `src/integrations/open-design/`，分别承载配置、服务声明、MCP 贡献和组装入口。
- **影响**: `src/core/main.ts` 只创建 ServiceSupervisor/IntegrationRegistry、合并贡献并协调关闭；`src/core/od-daemon.ts` 被删除。

### 变更: 配置收敛为单一事实来源
- **触发**: `.env` 和自动生成的 `~/.mcp.json` 同时持久化路径与端口，容易产生漂移，并在启动时修改用户全局文件。
- **改动**: `settings.json` 的 `integrations.openDesign` 成为持久配置；MCP Server 定义在内存中派生和合并，不再写文件。
- **影响**: 用户/项目配置支持字段级覆盖；`--with-od`、`OPEN_DESIGN_DIR`、`OD_PORT` 仅作为迁移期一次性输入。

## 修复记录

### 修复: daemon 启动弹出多余浏览器
- **症状**: `--with-od` 每次运行都会打开新的 Open Design 页面。
- **根因**: 启动命令未传入 OD 原生支持的 `--no-open`。
- **修复**: 所有命令解析路径统一携带 `--no-open`。

### 修复: daemon 崩溃与 MCP 断线恢复混杂
- **症状**: MCP UI 显示错误连接状态，daemon 退出后工具不可用，恢复责任不明确。
- **根因**: MCP 传输生命周期和 daemon 进程生命周期缺少独立所有者。
- **修复**: MCPManager 继续只处理 Driver 连接；ServiceSupervisor 处理 owned daemon 的重启预算和关闭。

### 修复: 关闭与 preflight health probe 竞态
- **症状**: shutdown 发生在启动前健康检查期间时，probe 结束后仍可能继续 spawn 服务。
- **根因**: preflight probe 未纳入 ServiceSupervisor 的统一 AbortController。
- **修复**: shutdown 会中止所有进行中的健康检查，ensure 在关闭状态下禁止 spawn，并增加取消后重试与 shutdown 竞态测试。

## 最终状态

### Why

Open Design 是可选外部集成，但此前其配置、进程生命周期、健康检查、重启策略和 MCP 文件修改直接位于 `src/core/main.ts` 与 `src/core/od-daemon.ts`。这使 Harness bootstrap 依赖单一产品 daemon，形成重复关闭所有权，也无法复用相同机制管理未来外部服务。

### What Changes

- 新增通用 Managed Service Supervisor，负责 owned 外部进程的启动、健康检查、重启、日志和优雅关闭。
- Open Design 的命令解析、配置、健康端点和 MCP 贡献迁移到 `src/integrations/open-design/`。
- `src/core/main.ts` 收敛为组合入口：加载配置、准备 Integration、构造 Harness、协调关闭。
- `settings.json` 的 `integrations.openDesign` 成为路径、端口、启用状态和自动启动行为的持久单一事实来源。
- `--with-od` 保留为迁移期一次性 runtime override，不成为第二个持久配置源。
- 停止自动创建或修改 `~/.mcp.json`，从 Integration 配置在内存中派生 `open-design` MCP Server。
- 保持非阻塞启动：Open Design 不可用时输出诊断，但 dscode 和其他 MCP Server 正常启动。
- 删除 `src/core/od-daemon.ts`。

### Capabilities

#### New Capabilities

- `managed-service-supervision`: 定义外部服务的所有权、健康检查、重启、日志和关闭契约。

#### Modified Capabilities

- `od-daemon-auto-start`: 从 Integration 配置解析启动，并通过 ServiceSupervisor 执行，同时保留 `--with-od` 兼容覆盖。
- `od-daemon-lifecycle`: 使用集中式 owned-service 生命周期替代 OD 专用 signal hook 和重启代码。
- `od-mcp-auto-config`: 使用确定性的内存 MCP 贡献替代 `~/.mcp.json` 持久写入。
- `open-design-env-config`: 使用 typed `settings.json` 替代 `.env` 主配置，并保留有边界的迁移 fallback。

### Impact

- 新增 `src/services/`、`src/integrations/`、`tests/services/`、`tests/integrations/open-design/`。
- 修改 `src/core/main.ts`、`src/core/config.ts`、`src/core/types.ts` 和配置测试。
- 删除 `src/core/od-daemon.ts`。
- Open Design 作为虚拟设备，由 MCP Driver 访问；OD daemon 作为用户态服务进程，由 ServiceSupervisor 监管。
- 用户与项目 MCP 文件不再被启动流程修改；持久同名条目冲突时，Integration 贡献仅在当前运行中覆盖并输出诊断。
- 无新增运行时依赖，无 UI 协议或视觉变更。
