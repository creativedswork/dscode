## 1. App.tsx — Processing state cleanup

- [x] 1.1 在 `handleEvent` 的 `assistant_end` / `clear_conversation` 分支中，移除 `setProcessing(false)` 调用，仅保留 `setMessages(reducer)` 调用
- [x] 1.2 给 `ChatView` 组件新增 `turnStartRef: React.MutableRefObject<number>` prop，在 JSX 中将 `turnStartRef` 传入 `<ChatView>`

## 2. ChatView.tsx — Timer 重写

- [x] 2.1 新增 `turnStartRef` prop 到 `ChatViewProps` 接口
- [x] 2.2 移除现有的 `useEffect` timer（依赖 `[processing]` 的 `setInterval` 逻辑）
- [x] 2.3 新增基于 `turnStartRef` + `requestAnimationFrame` 的 elapsed 计算逻辑

## 3. turnStartRef lifecycle management

- [x] 3.1 `handleSend` 中设置 `turnStartRef.current = Date.now()`
- [x] 3.2 `loader { state: "show" }` 中设置 `turnStartRef.current = Date.now()`（vision/OCR 预处理场景）
- [x] 3.3 `loader { state: "hide" }` 中重置 `turnStartRef.current = 0`
- [x] 3.4 移除 `assistant_start` 中的 `turnStartRef.current = Date.now()`

## 4. UiBackend lifecycle documentation

- [x] 4.1 为 `UiBackend` 接口添加 Conversation Turn Lifecycle 文档
- [x] 4.2 为每个方法添加 JSDoc（调用者、合约、是否可改变 processing 状态）
- [x] 4.3 `setProcessing` 方法明确标注调用限制

## 5. Spec 更新

- [x] 5.1 更新 `web-frontend` spec：timer 锚点改为 `handleSend`/`loader {show}`
- [x] 5.2 新增强制场景：`assistant_end` SHALL NOT 改变 processing 状态

## 6. 验证

- [ ] 6.1 发送普通消息，确认 Thinking 阶段计时器从 0s 开始递增
- [ ] 6.2 发送普通消息，确认发送按钮在点击后立即变为 Stop 按钮，并在 agent 结束后恢复为 Send 按钮
- [ ] 6.3 发送消息后点击 Stop 按钮，确认 abort 流程正常（timer 停止、按钮恢复）
- [ ] 6.4 在慢速网络/长 Thinking 场景下确认 timer 不卡在 0s
- [ ] 6.5 带图片消息确认 vision/OCR 预处理阶段 timer 正常工作
