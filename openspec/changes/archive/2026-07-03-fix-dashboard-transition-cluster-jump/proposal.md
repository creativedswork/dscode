## Why

Chat → Dashboard 转场动画中，dscode cluster 撞击第一条 message 的 `text-line` 元素时，`strikeRow()` 将元素从 `display: inline` 改为 `inline-block`，随即以 `getBoundingClientRect()` 重新校准 cluster Y 坐标。`inline` → `inline-block` 转换（尤其 `<span>` 内包 `<div>` 的非法 HTML 嵌套）触发浏览器布局引擎的匿名块盒重构，导致 `getBoundingClientRect().top` 发生偏移，cluster 跳至视口上方不可见区域。

## What Changes

- **TransitionCanvas `strikeRow()`**: recalibration 不再依赖 DOM mutation 后的 `getBoundingClientRect()`，改用 mutation 前 snapshot 的位置值

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `chat-dashboard-transition`: 修改 `strikeRow()` 中 recalibration 阶段的行位置测量策略

## Impact

- `web/src/components/TransitionCanvas.tsx` — `strikeRow()` 函数内的 recalibration 逻辑
