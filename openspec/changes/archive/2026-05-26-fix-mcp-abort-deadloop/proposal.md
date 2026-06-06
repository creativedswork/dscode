## Why

当 MCP 工具在服务端进入死循环（CPU-bound 或阻塞等待）时，用户按下 Ctrl+C 或 Stop 按钮后，会话无法中断，Agent 永久卡死。根因有三：

1. **`onAbort` 无异常保护**：`MCPClient.request()` 中的 `onAbort` handler 在调用 `sendNotification` 和 `httpReq.destroy()` 时可能抛出异常（如 stdin pipe 关闭、HTTP socket 异常），导致 `reject()` 永远不被调用，Promise 永久 pending，`await` 永不返回，Agent loop 卡死在 `Promise.all`。

2. **Abort 后 loop 不立即终止**：MCP tool 的 `execute` 函数捕获 `AbortError` 后返回普通结果（`terminate` 默认为 undefined，即 false），`executePreparedToolCall` 将其视为成功执行。Agent loop 必须等到下一轮 LLM 调用发现 `signal.aborted` 才能终止，增加了不必要的延迟和失败点。

3. **MCP 子进程未清理**：对于 stdio transport，abort 后客户端只发送 `notifications/cancelled` 通知，但服务端正忙于死循环根本无法读取 stdin。僵尸进程持续占用资源，且 pipe 可能因缓冲区满导致后续操作异常。

## What Changes

- **强化 `MCPClient.onAbort`**：用 try-catch 包裹，确保 `reject()` 始终被调用；将 `reject()` 移到 `sendNotification` 之前
- **Agent loop 立即终止**：在 `executeToolCalls` 返回后、agent loop 继续前检查 `signal.aborted`，立即终止而非走下一轮 LLM
- **MCP 进程清理**：stdio transport abort 时发送 SIGTERM/SIGKILL 给子进程

## Capabilities

### Modified Capabilities

- `mcp-tool-abort`: 新增 abort 鲁棒性、loop 提前终止、进程清理三个需求

## Impact

- **MCP Client**：`request()` 方法的 `onAbort` handler 重构，增加 try-catch
- **Agent Loop**（`pi-agent-core`）：需新增 signal 检查点（如无法修改库，则在 harness 层通过 `afterToolCall` 检查）
- **MCP Manager**：stdio transport 的 `close()` 增加进程 kill 逻辑
