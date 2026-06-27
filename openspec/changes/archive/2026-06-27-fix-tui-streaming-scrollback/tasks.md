## 1. Core Fix

- [x] 1.1 将 `ConversationView.renderLive()` 中 `this.tui.requestRender(true)` 改为 `this.tui.requestRender(false)`

## 2. Boundary Safety

- [x] 2.1 在 `startAssistantMessage()` 中，重置 live 状态后调用一次 `this.tui.requestRender(true)` 作为状态边界清理，确保新一轮流式输出的差分基准正确

## 3. Verification

- [ ] 3.1 手动测试：启动 TUI、触发 LLM 对话，在流式输出期间用鼠标/Shift+PgUp 向上滚动，验证 scrollback 完整可翻阅
- [ ] 3.2 手动测试：确认流式输出视觉效果无闪烁、`thinking` buffer 和 tool 状态显示正常
- [ ] 3.3 手动测试：多轮对话后，非流式内容（用户消息、完成消息、info/error）渲染正常
