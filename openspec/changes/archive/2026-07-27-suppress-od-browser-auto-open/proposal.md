## Why

`npm start -- --with-od` 启动时会自动打开 Open Design 的浏览器窗口。dscode 通过 MCP 协议调用 OD daemon，用户通过 dscode 的 Web UI 或 TUI 使用 OD 功能，不需要 OD 自己弹出浏览器。每次启动都弹出一个多余的浏览器标签页，打断工作流。

## What Changes

- 在 `resolveOdCommand` 中给 OD daemon 传递 `--no-open` 参数，抑制 OD 自带的浏览器自动打开行为
- 同时覆盖两条命令路径：Direct `od` binary 和 pnpm fallback

## Capabilities

### New Capabilities
<!-- No new capabilities — this is a behavior tweak to existing daemon startup logic. -->

### Modified Capabilities
- `od-daemon-auto-start`: `resolveOdCommand` 的 args 从 `["--port", "<port>"]` 改为 `["--port", "<port>", "--no-open"]`，OD daemon 启动后不再自动打开浏览器

## Impact
- **修改文件**: `src/core/od-daemon.ts` (`resolveOdCommand` 函数，两条命令路径各加一个 arg)
- **不涉及**: CLI flags、MCP 协议、WebSocket、React 组件、配置格式
