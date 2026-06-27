## Why

Chat → Dashboard 转场动画中，dscode cluster 在 cascade 阶段撞击 `overflow-y: auto/scroll` 内层容器（如 ToolCard 的 `max-h-40 overflow-y-auto` 结果区、代码块 `pre` 的 `overflow-x-auto`）内的 `data-collider` 行时，`strikeRow()` 的 layout freeze + DOM mutation（`destroyByType()` 替换 innerHTML）会导致内层滚动容器的 `scrollTop` 发生累积漂移，使原本被 max-height 裁剪隐藏的内容上浮进入可视区。现有 `fix-dashboard-transition-cluster-jump` 只修复了 cluster 自身 Y 坐标跳跃，未覆盖内层滚动容器。

## What Changes

- `TransitionCanvas.strikeRow()`: 在 DOM mutation 前后 snapshot/restore 被撞击元素所在内层滚动祖先的 `scrollTop`，消除累积漂移
- `TransitionCanvas.hideOffscreenColliders()`: 对内层滚动容器内被 `overflow: hidden` 裁剪的 collider，额外通过 `opacity: 0` 隐藏，防止 scrollTop 恢复后短暂可见的幽灵行

## Capabilities

### New Capabilities
<!-- None — 此修复是现有能力的 bug fix，不引入新能力 -->

### Modified Capabilities
- `chat-dashboard-transition`: 修改 "Scroll locking during animation" 需求——将程序化 scroll lock 的作用域从仅 ChatView 主滚动区扩展到所有被撞击元素的内层滚动容器

## Impact

- `web/src/components/TransitionCanvas.tsx` — `strikeRow()` 和 `hideOffscreenColliders()` 函数
