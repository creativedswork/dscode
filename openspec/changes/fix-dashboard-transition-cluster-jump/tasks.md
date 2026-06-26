## 1. Snapshot recalibration in strikeRow

- [x] 1.1 在 `strikeRow()` 函数开头（layout freeze 之前）用 live `getBoundingClientRect()` snapshot `preFreezeTop`，并在 layout freeze 之后测量 delta，用 CSS transform 补偿位置偏移
- [x] 1.2 recalibration 阶段将 `row.top = newTop` 和 `c.y = newTop` 替换为 `row.top = snapshotTop` 和 `c.y = snapshotTop`
- [x] 1.3 unstruck rows 的 recalibration 保持不变（仍用 live `getBoundingClientRect()`）

## 2. Verify

- [ ] 2.1 加载含长文本第一条 message 的 session（如 00MQF6C1），Chat → Dashboard 转场确认 cluster 不再跳至不可见区域
- [ ] 2.2 验证其他 collider 类型（code-line、tool-header、tool-result-line）的转场效果无回归
- [ ] 2.3 验证 message-card 的直接撞击行为无回归
