## 1. Pre-turn save — `message_end` 事件处理

- [x] 1.1 在 `Harness.agent.subscribe()` 中新增 `message_end` case，检查 `event.message?.role === "user"`
- [x] 1.2 在 handler 中调用 `this.sessionManager.trySaveSession(this.agent)` 并更新 `this.lastSavedMessageCount`
- [ ] 1.3 验证：添加日志 tag `PreTurnSave`，启动 dscode 发送消息，用 `grep PreTurnSave ~/.dscode/logs/dscode.log` 确认 pre-turn save 在 LLM 响应前触发
- [x] 1.4 验证：`npm run typecheck` 通过

## 2. Periodic auto-save — 15s interval timer

- [x] 2.1 在 `Harness` 类中新增私有字段 `autoSaveTimer: NodeJS.Timeout | undefined` 和 `lastSavedMessageCount: number = 0`
- [x] 2.2 实现 `startAutoSave()` 方法：`setInterval` 每 15s 检查 `agent.state.messages.length !== lastSavedMessageCount`，变化则 `trySaveSession` 并更新计数
- [x] 2.3 timer 调用 `.unref()` 防止阻止进程退出
- [x] 2.4 在 `Harness.run()` 中启动 auto-save timer（MCP 初始化完成后）
- [x] 2.5 在 `Harness.shutdown()` 中清除 timer：`clearInterval(this.autoSaveTimer)`
- [x] 2.6 在所有现有保存点（`agent_end`、`turn_end`、shutdown 中的 save）更新 `lastSavedMessageCount`
- [ ] 2.7 验证：添加日志 tag `AutoSave`，启动 dscode，等待 >15s，确认周期性保存触发
- [x] 2.8 验证：`npm run typecheck` 通过

## 3. 集成验证

- [ ] 3.1 端到端验证：启动 dscode，发送消息后立即 `kill -9`，重新加载 session 确认 user message 保留
- [ ] 3.2 确认正常退出流程不受影响（timer 不阻止退出）
- [x] 3.3 运行 `npm test` 确认无回归
