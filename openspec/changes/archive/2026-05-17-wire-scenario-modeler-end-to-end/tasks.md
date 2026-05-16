## 1. AppHostManager pushToApp

- [x] 1.1 修改 `src/apps/host.ts` — 新增 `pushToApp(appId, message)` 方法，向所有 SSE 客户端写入 JSON
- [x] 1.2 修改 `src/apps/host.ts` — `handleBridgeSSE` 中存储 SSE 客户端引用以供 push

## 2. Harness tool result forwarding

- [x] 2.1 修改 `src/core/harness.ts` — `checkAndRegisterApp` 增加 `result` 参数，注册 app 后调用 `pushToApp`
- [x] 2.2 修改 `src/core/harness.ts` — `bindEvents` 中 `tool_execution_end` 传递 `event.result` 给 `checkAndRegisterApp`

## 3. Demo setup

- [x] 3.1 创建 `examples/scenario-modeler/.dscode/settings.json` — 预置 MCP 配置指向 localhost:3100
- [x] 3.2 修改 `examples/scenario-modeler/package.json` — 新增 `demo` 脚本 (concurrently server + dscode)
- [x] 3.3 安装 `examples/scenario-modeler/` 的 devDependencies: `concurrently`

## 4. Verify

- [x] 4.1 运行 `npm run typecheck` 确保零错误
- [x] 4.2 验证 `npm run demo` 启动 server 和 dscode TUI
- [x] 4.3 端到端验证: TUI 输入 "分析SaaS增长" → TUI 显示 URL → 浏览器打开 → 图表渲染
