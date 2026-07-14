## 1. strikeRow: inner scrollTop preservation

- [x] 1.1 在 `strikeRow()` 的 `destroyByType()` 调用前，通过 `findScrollAncestor(row.el)` 查找内层滚动祖先，snapshot `scrollTop`
- [x] 1.2 在 `destroyByType()` 调用后、recalibration 循环前，同步恢复内层滚动祖先的 `scrollTop` 到 snapshot 值
- [x] 1.3 添加 console.log 追踪 snapshot/restore 的 scrollTop 值（可后续移除）

## 2. hideOffscreenColliders: inner scroll clip

- [x] 2.1 在 `hideOffscreenColliders()` 中，对每个 collider 若存在内层滚动祖先，检查其 rect 是否被祖先裁剪（`rect.bottom <= saRect.top` 或 `rect.top >= saRect.bottom`），若裁剪则设置 `opacity: 0`

## 3. Verify

- [ ] 3.1 启动 web 模式，加载含多条 tool-result-line 的 session，触发 Chat → Dashboard 转场，确认内层 `max-h-40 overflow-y-auto` 容器内隐藏内容不再上浮
- [ ] 3.2 验证 code-line（`pre overflow-x-auto` 内）撞击后无回归
- [ ] 3.3 验证外层 ChatView 主滚动区 lock 逻辑无回归
- [ ] 3.4 验证多次撞击（3+ 次同一内层容器内行）后 scrollTop 稳定
