## 1. Configuration Foundation

- [x] 1.1 创建 `.env.example`，包含 `OPEN_DESIGN_DIR` 和 `OD_PORT` 的注释示例
- [x] 1.2 在 `.gitignore` 中添加 `.env`（已存在，无需修改）

## 2. CLI Flag Parsing

- [x] 2.1 在 `parseArgs()` 中添加 `--with-od` 解析，返回类型增加 `withOd: boolean`
- [x] 2.2 在 `main()` 中读取 `withOd` 并传递到 daemon 启动逻辑的调用点

## 3. Daemon Lifecycle Module

- [x] 3.1 创建 `src/core/od-daemon.ts`，实现 `resolveOdCommand()` — 返回 `{ cmd, args, cwd }`，预留全局命令切换点
- [x] 3.2 实现 `startOdDaemon(odDir, odPort)` — spawn 子进程，`unref()`，返回 `ChildProcess`
- [x] 3.3 实现 `waitForOdDaemon(port, timeoutMs)` — 500ms 间隔轮询 `http://127.0.0.1:{port}/health`，超时返回 false
- [x] 3.4 实现 `registerOdCleanup(odChild)` — 在进程退出/SIGINT/SIGTERM 时 SIGTERM → 3s → SIGKILL

## 4. MCP Auto-Config

- [x] 4.1 在 `od-daemon.ts` 中实现 `ensureOdMcpEntry(odDir, odPort)` — 读取 `~/.mcp.json`，不存在则创建，open-design 条目缺失/路径不匹配/端口不匹配时更新
- [x] 4.2 处理 `~` 路径展开：`.env` 中的 `OPEN_DESIGN_DIR` 支持 `~` 前缀，写入 `~/.mcp.json` 时使用展开后的绝对路径
- [x] 4.3 处理权限不足：`~/.mcp.json` 不可写时打印警告并返回 false，不抛异常

## 5. Integration Into Main

- [x] 5.1 在 `main()` 中，当 `withOd` 为 true 时依次调用：`ensureOdMcpEntry` → `startOdDaemon` → `waitForOdDaemon`，每次调用结果日志化
- [x] 5.2 注册 daemon 清理处理器
- [x] 5.3 监听子进程 `exit` 事件，异常退出时打印日志

## 6. Verification

- [x] 6.1 运行 `npm run typecheck` 确保编译通过
- [ ] 6.2 手动测试：`OPEN_DESIGN_DIR` 未设时 `--with-od` 打印警告并继续启动
- [ ] 6.3 手动测试：正确配置后 `--with-od`，确认 `~/.mcp.json` 自动生成且 MCP 连接成功
- [ ] 6.4 手动测试：Ctrl+C 退出时 daemon 子进程被清理
