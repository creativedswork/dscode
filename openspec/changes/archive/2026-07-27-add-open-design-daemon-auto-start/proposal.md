## Why

Open Design is dscode 的 MCP 前端设计工具，能通过独立 agent 生成设计原型并返回可预览的 URL。但目前每次使用前需要手动在另一个终端 `cd` 到 Open Design 目录执行 `pnpm tools-dev run web` 启动 daemon — 这是一个摩擦点，阻碍了探索模式中即时出原型的工作流。

## What Changes

- 新增 `.env.example` 文件，定义 `OPEN_DESIGN_DIR` 和 `OD_PORT` 两个环境变量，作为 Open Design daemon 的路径和端口配置入口
- 新增 `--with-od` CLI flag（与 `--web` 正交），启动时自动 spawn Open Design daemon 子进程
- daemon 启动后轮询 health check 直到就绪，dscode 主进程退出时自动清理子进程
- `.gitignore` 中加入 `.env`
- 启动时根据 `.env` 自动生成/刷新 `~/.mcp.json` 中 `open-design` 的 MCP 条目，确保 `command` 和 `args` 中的路径指向正确的本地 daemon

## Capabilities

### New Capabilities
- `open-design-env-config`: `.env.example` 定义 `OPEN_DESIGN_DIR`（Open Design 仓库路径）和 `OD_PORT`（daemon 端口，默认 7456），`.env` 由用户自行创建并加入 `.gitignore`
- `od-daemon-auto-start`: `--with-od` CLI flag，启动时读取 `OPEN_DESIGN_DIR`/`OD_PORT`，spawn `pnpm tools-dev run web` 子进程，轮询 health check 直到 daemon 就绪后继续正常启动流程
- `od-mcp-auto-config`: 从 `.env` 的 `OPEN_DESIGN_DIR`/`OD_PORT` 自动生成 `~/.mcp.json` 中的 `open-design` MCP 条目（使用本地 `tsx` 运行 daemon CLI），条目不存在则创建，路径/端口不匹配则更新
- `od-daemon-lifecycle`: 子进程生命周期管理 — dscode 正常退出或收到 SIGINT/SIGTERM 时，先 SIGTERM daemon 子进程，3 秒超时后 SIGKILL；预留未来全局安装 `open-design` 命令的切换点

### Modified Capabilities
<!-- No existing specs are modified by this change. -->

## Impact
- **修改文件**: `.gitignore`, `src/core/main.ts`, `src/core/od-daemon.ts`
- **自动生成**: `~/.mcp.json` (open-design 条目)
- **新增文件**: `.env.example`
- **修改文件**: `.gitignore`, `src/core/main.ts`
- **依赖**: 无新增 npm 依赖（使用 Node 原生 `child_process` 和 `--env-file`）
- **不涉及**: WebSocket 协议、React 组件、CSS、MCP 协议
