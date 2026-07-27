## Context

`src/core/od-daemon.ts` 的 `resolveOdCommand` 函数构造 OD daemon 的启动命令参数。OD daemon 原生支持 `--no-open` flag，dscode 目前未传递该 flag，导致 OD daemon 的 `daemon-startup.ts` 在就绪后调用 `openBrowser(started.url)` 打开浏览器。

dscode 通过 MCP 协议与 OD 通信，OD 的 Web UI 通过 MCP 协议在 dscode 内访问，不需要 OD 独立打开浏览器窗口。

## Goals / Non-Goals

**Goals:**
- `npm start -- --with-od` 启动后不再自动打开浏览器
- 改动最小化，只在 `resolveOdCommand` 加一个 arg

**Non-Goals:**
- 不添加新的 CLI flag（如 `--no-open` 给 dscode）
- 不改变 OD daemon 本身的行为
- 不改变 dscode 的 Web 模式行为

## Decisions

**Decision 1: 在 `resolveOdCommand` 硬编码加 `--no-open`**

- **选择**: 直接在两处 args 数组末尾追加 `"--no-open"`
- **替代方案 A**: 给 dscode 加 `--no-open` CLI flag 透传 — 过度设计，dscode 永远不需要 OD 弹窗
- **替代方案 B**: 环境变量控制 — 增加了间接层，一个 arg 就够了
- **理由**: dscode 作为 OD daemon 的唯一调用方，永远不需要 OD 的独立浏览器窗口。OD 功能通过 MCP 集成到 dscode 的 TUI/Web UI 中使用。

**Decision 2: 两条命令路径都加**

- Direct `od` binary: `["--port", "<port>", "--no-open"]`
- pnpm fallback: `["tools-dev", "run", "web", "--", "--port", "<port>", "--no-open"]`
- **理由**: 无论走哪条路径，行为应一致。

## Risks / Trade-offs

- **Risk**: 如果未来 OD daemon 移除 `--no-open` flag → **Mitigation**: OD 的 CLI 会把不认识的 flag 报错，dscode 的 `waitForOdDaemon` 会超时然后继续启动，不会阻塞。出错时有 stderr 输出（`stdio: "ignore"` 会丢弃但有日志）。
- **Risk**: 如果用户确实想打开 OD 的浏览器窗口 → **Mitigation**: 极低概率场景。OD 的 Web UI 已通过 MCP 在 dscode 内可用。退一步用户可以手动在浏览器打开 `http://localhost:7456`。
