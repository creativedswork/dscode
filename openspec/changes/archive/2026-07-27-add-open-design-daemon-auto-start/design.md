## Context

dscode 是一个 TypeScript CLI 工具，入口为 `src/core/main.ts`。当前 `parseArgs()` 解析 `--web`、`--web-port`、`--debug`、`--cwd` 四个 flag。项目不加载任何 `.env` 文件，环境变量配置（如 `DSCODE_CONFIG_HOME`）直接从 `process.env` 读取。

Open Design 是独立的 MCP 设计工具，daemon 通过 `pnpm tools-dev run web` 启动，监听 `127.0.0.1:7456`。dscode 通过 MCP server 配置连接该端口。目前 daemon 需手动启动，无法随 dscode 自动拉起。

Node.js 的 target 为 ≥20.6（当前项目 `engines.node` 和 tsconfig 判断），原生支持 `--env-file=.env`，无需额外依赖。

## Goals / Non-Goals

**Goals:**
- 提供 `.env.example` + `.gitignore` 机制，让用户声明 `OPEN_DESIGN_DIR` 和 `OD_PORT`
- 新增 `--with-od` CLI flag，启动时自动 spawn Open Design daemon
- daemon 就绪检测：轮询 `http://127.0.0.1:${OD_PORT}/health` 直到 200
- 主进程退出时自动清理 daemon 子进程（SIGTERM → 3s → SIGKILL）
- 预留全局安装 `open-design daemon` 命令的切换点
- 根据 `.env` 自动生成/刷新 `~/.mcp.json` 中 `open-design` 的 MCP 条目，使用本地 daemon 路径

- 不自动安装 Open Design 或检测其是否已安装
- 不修改 MCP server 配置（用户仍需在 `~/.mcp.json` 或项目 `.mcp.json` 中配置 Open Design server）
- 不自动安装 Open Design 或检测其是否已安装
- 不处理 daemon 崩溃后的自动重启（这是 v2 考虑的事）
- 不修改 `--version` / `--help` 行为
- 不引入 dotenv 等第三方依赖

## Decisions

### D1: 使用 `.env` 文件 + Node 原生 `--env-file`

**Decision**: 新增 `.env.example`，定义 `OPEN_DESIGN_DIR` 和 `OD_PORT`。用户复制为 `.env` 后填入实际值。`.env` 加入 `.gitignore`。dscode 启动时通过 Node 原生 `--env-file=.env` 加载。

**Rationale**: dscode 已有 `DSCODE_CONFIG_HOME`、`DSCODE_DATA_HOME` 等 env-var 驱动的配置先例。`.env` 是 Node.js 生态的标准惯例，`.env.example` 提供文档化指引。Node ≥20.6 的 `--env-file` 原生支持，零额外依赖。相比 `~/.dscode/settings.json`，`.env` 更适合存放「路径」类配置 — settings.json 的职责是用户行为偏好（权限、skills、retry）。

**Alternatives considered**:
- *`~/.dscode/settings.json`*: 现有配置体系，但 settings.json 目前没有路径类配置的先例，且需要额外的 JSON schema 扩展。
- *`dotenv` npm 包*: 功能完整但引入额外依赖，Node 原生方案足够。
- *CLI flag `--od-dir`*: 每次启动都要传参，体验差。

### D2: `--with-od` 与 `--web` 正交

**Decision**: `--with-od` 不隐含 `--web`。用户可组合使用：`dscode`（CLI）、`dscode --with-od`（CLI + OD）、`dscode --web`（Web UI）、`dscode --with-od --web`（全开）。

**Rationale**: Open Design 的设计生成和预览是独立的 — `start_run` → `get_run` → `previewUrl`，用户在浏览器里直接打开即可，无需 dscode Web UI。

**Alternatives considered**:
- *`--with-od` 隐含 `--web`*: 限制了 CLI-only 场景，且违反最少惊讶原则。

### D3: 启动命令 `pnpm tools-dev run web`，预留全局命令切换

**Decision**: 当前通过 `child_process.spawn("pnpm", ["tools-dev", "run", "web"], { cwd: odDir })` 启动。代码中封装 `resolveOdCommand()` 函数，先检查 `open-design daemon` 全局命令是否可用（`which open-design`），可用则走全局路径，否则 fallback 到 `pnpm` 模式。

**Rationale**: `pnpm tools-dev run web` 是 open-design 当前的开发命令，直接可用。但全局安装是明确的后续方向，预留切换点避免未来改动扩散。

**Alternatives considered**:
- *直接跑 `node <od-dir>/dist/daemon.mjs`*: 对 od 内部实现假设过强。

### D4: Health check 轮询策略

**Decision**: `spawn` 后每 500ms 轮询 `http://127.0.0.1:${OD_PORT}/health`，最多等待 30 秒。超时后打印警告但不阻塞 dscode 启动。

**Rationale**: 30 秒是对 daemon 启动的合理等待上限。不阻塞启动意味着即使 daemon 启动失败，dscode 仍可正常工作（只是 OD MCP 工具不可用）。

**Alternatives considered**:
- *阻塞直到成功*: daemon 故障会导致 dscode 无法启动。
- *完全异步，不等待*: 可能在 MCP 初始化时 daemon 尚未就绪。

### D5: 子进程清理策略

**Decision**: 在 `process.on("exit")` 和已有的 SIGINT/SIGTERM handler 中加入清理逻辑：`odChild.kill("SIGTERM")` → `setTimeout(3000, () => odChild.kill("SIGKILL"))`。使用 `child.unref()` 避免子进程阻止主进程退出。

同时监听子进程的 `exit` 事件，如果 daemon 异常退出，打印日志但不影响 dscode。


### D6: MCP 条目自动生成

**Decision**: 启动时根据 `.env` 的 `OPEN_DESIGN_DIR` 和 `OD_PORT`，自动生成或刷新 `~/.mcp.json` 中的 `open-design` 条目。生成的内容为：
```json
"open-design": {
  "command": "npx",
- **[Risk] `~/.mcp.json` 写入权限不足** → 打印警告，跳过自动生成，不阻塞启动
  "args": [
    "tsx",
    "<OPEN_DESIGN_DIR>/apps/daemon/src/cli.ts",
    "mcp",
    "--daemon-url",
    "http://127.0.0.1:<OD_PORT>"
  ]
}
```
- 条目不存在 → 创建
- 存在但 `args` 中的路径或端口不匹配 `.env` → 更新
- 匹配 → 跳过
- 其他 `~/.mcp.json` 条目（非 open-design）完全不受影响

**Rationale**: `.env` 已经声明了 daemon 的本地路径和端口，`~/.mcp.json` 的 MCP 条目是冗余信息，应该自动同步。用户在 `.env` 改一个地方就够了。使用 `tsx` + 本地 daemon CLI 路径（而非远程或 npx 包），确保 MCP proxy 连接到的是本地运行的 daemon。

**Alternatives considered**:
- *让用户手动配 `~/.mcp.json`*（原 Non-Goal）: 增加配置同步负担，`.env` 改路径后 `~/.mcp.json` 可能指向旧路径导致 MCP 连接失败
- *写入项目 `.mcp.json`*: 项目级配置不适用于「工具安装路径」这种机器级信息；`~/.mcp.json` 是标准做法
**Rationale**: 标准的 graceful shutdown 模式 — 先给子进程 3 秒优雅退出，超时则强制杀死。

## Risks / Trade-offs

- **[Risk] `pnpm` 不可用** → 打印清晰的错误信息 "pnpm not found. Ensure pnpm is installed and Open Design is set up at $OPEN_DESIGN_DIR"，不阻塞启动
- **[Risk] `OPEN_DESIGN_DIR` 未设置但传了 `--with-od`** → 打印 "OPEN_DESIGN_DIR is not set. Create a .env file from .env.example"，不阻塞启动
- **[Risk] 端口 7456 已被占用** → daemon 自身会报错并退出，dscode 在 health check 超时后打印警告，不影响主流程
- **[Risk] daemon 在 dscode 运行期间崩溃** → 当前不做自动重启。监控子进程 `exit` 事件并打印日志。自动重启留给 v2。
- **[Trade-off] 调试复杂度** → `--with-od` 多了一个后台进程，排查问题时需注意两个进程的日志输出
