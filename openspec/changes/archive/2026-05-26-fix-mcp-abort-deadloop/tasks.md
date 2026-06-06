## 1. Fix: Robust onAbort in MCPClient.request()

- [x] 1.1 重构 `onAbort` handler：将 `reject()` 移到 `sendNotification()` 和 `httpReq.destroy()` 之前
- [x] 1.2 用 try-catch 包裹 `sendNotification()` 调用，防止异常中断 reject
- [x] 1.3 用 try-catch 包裹 `httpReq.destroy()` 调用，防止异常中断 reject
- [ ] 1.4 验证：模拟 `sendNotification` 抛异常场景，确认 Promise 仍被正确 reject

## 2. Fix: Agent Loop 立即终止

- [x] 2.1 修改 `MCPManager.buildAgentTool` 中 AbortError catch 分支，设置 `terminate: true`
- [x] 2.2 在 `harness.afterToolCall` 中增加兜底检查：如果 `signal.aborted`，返回 `{ terminate: true }`
- [ ] 2.3 验证：MCP 工具 abort 后 agent loop 不再发起 LLM 调用，直接终止

## 3. Fix: MCP 子进程清理

- [x] 3.1 在 `MCPClient` 中新增 `killProcess()` 方法：先 SIGTERM，2s 后 SIGKILL
- [x] 3.2 在 `onAbort` 中（reject 之后）对 stdio transport 调用 `killProcess()`
- [x] 3.3 确保 `close()` 中的正常关闭路径（`closeStdioGracefully`）不受影响
- [ ] 3.4 验证：abort 后子进程在 2s 内被终止，不残留僵尸进程

## 4. 测试与回归

- [ ] 4.1 手动测试：启动一个死循环 MCP 工具，Ctrl+C 确认能立即中断
- [ ] 4.2 手动测试：Web UI Stop 按钮确认能立即中断
- [ ] 4.3 验证正常工具调用不受影响（abort 逻辑不影响正常成功/失败路径）
- [ ] 4.4 验证 streamable-http transport 的 abort 不受影响
