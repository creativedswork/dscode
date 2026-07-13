## Why

工具执行期间，TUI 的计时器和 spinner 动画完全冻结——因为 `drivers/shell.ts`、`drivers/fs.ts`、`drivers/search.ts`、`drivers/edit/tool.ts` 中大量使用了同步阻塞的 I/O 调用（`execSync`、`readFileSync`、`writeFileSync`、`statSync`、`readdirSync` 等），导致 Node.js 事件循环被卡死。工具 `execute` 函数虽标记为 `async`，但内部同步调用仍占死线程。需将所有同步 I/O 替换为异步版本，让事件循环在工具等待 I/O 期间保持空闲，TUI 渲染正常进行。

## What Changes

- `drivers/shell.ts`：`execSync` → promisified `exec`，保持相同的错误形状（stdout/stderr/status）
- `drivers/fs.ts`：`readFileSync`/`writeFileSync`/`existsSync`/`statSync`/`readdirSync`/`mkdirSync` → `fs/promises` 对应方法
- `drivers/search.ts`：`readdirSync`/`statSync`/`readFileSync`/`existsSync` → `fs/promises`，`walkDir` 改为 async 递归
- `drivers/edit/tool.ts`：`readFileSync`/`writeFileSync`/`existsSync` → `fs/promises`

## Capabilities

### New Capabilities

- `async-driver-io`: 所有驱动层文件 I/O 和 shell 执行均为非阻塞异步操作，工具执行期间事件循环保持空闲，TUI 渲染（计时器、spinner）不受影响

### Modified Capabilities

（无 —— 工具行为语义不变，仅 I/O 方式从同步改为异步，对调用方透明）

## Impact

- `src/drivers/shell.ts` — 1 处 `execSync` 替换
- `src/drivers/fs.ts` — ~15 处同步 FS 调用替换，`listFilesTool` 的递归 `walk` 改为 async
- `src/drivers/search.ts` — ~8 处同步 FS 调用替换，`walkDir` 改为 async 递归
- `src/drivers/edit/tool.ts` — 3 处 `readFileSync`/`writeFileSync`/`existsSync` 替换
- pi-agent 调用 `await tool.execute()` 已兼容 Promise 返回值，无需改动
