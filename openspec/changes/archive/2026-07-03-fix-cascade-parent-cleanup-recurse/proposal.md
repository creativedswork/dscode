## Why

Chat→Dashboard 转场动画中，当消息气泡包含嵌套的 tool-card 时，cascade 完成所有子元素的打击后，外层 message-card 气泡壳不会被清理——用户看到空的气泡边框残留在画面上。

根因是 `strikeRow()` 中的 parent card cleanup 逻辑不递归：
- 每个被 strike 的 row 通过 `closest()` 找到最近的 `[data-collider="tool-card"]` 或 `[data-collider="message-card"]` 祖先
- 当最后一个 row（如 tool-result-line）被 strike 时，`closest()` 返回的是内层 tool-card
- tool-card 的 cleanup 触发，但外层 message-card 永远不会被重新检查

受影响的消息类型：包含 tool-card 的 assistant 消息（几乎全部 assistant 消息都满足），以及没有子 collider 的纯 thinking 消息。

## What Changes

- **递归 parent card cleanup**: 当内层容器（tool-card）的所有子元素被打完后，在清理 tool-card 之后向上递归检查外层容器（message-card）是否也该清理
- **message-card final cleanup**: 当 message-card 作为最终被清理的祖先容器时，设置 `opacity: 0`（现有 spec 要求不修改 opacity 的假设基于 "message-card 总有子 collider 要做独立动画"，在递归清理路径下该假设不成立）
- **构建 `cardStack` 自底向上遍历**: 替代单一 `closest()` 查找，改为从当前 row 向祖先方向构建完整容器栈，逐层检查清理

## Capabilities

### Modified Capabilities
- `chat-dashboard-transition`: 修改 "message-card destruction" 需求——当 message-card 通过递归清理被销毁时，允许设置 opacity 0 而非仅做白闪

## Impact

- `web/src/components/TransitionCanvas.tsx` — `strikeRow()` 中的 parent card cleanup 逻辑（约 line 845–860），重写为递归清理
