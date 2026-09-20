## Why

chat → Session Dashboard 的过渡动画（TransitionCanvas）存在「撞击不完整」缺陷：cascade 阶段只收集**当前视口内**的 `[data-collider]` 行（约 10 行），撞完可见行后 `selectNextCascadeRowIndex()` 返回 `-1` 触发 `startGather()`，把整个滚动容器一刀淡出——视口外已经完整渲染、但从未被撞击的几十行内容瞬间消失。用户感知为「50 行只撞了 10 行，画面就清空进入过渡」。

## What Changes

- **全文撞击（核心修复）**：`buildRowList()` 从「只收集可视区 collider」改为「用内容坐标收集全文所有 collider」，cascade 逐行撞完整段内容，而不是只撞第一屏。
- **自动滚动**：cluster 下探时按需平滑滚动聊天容器，让折叠区之外的每一行都进入视口被撞。
- **撞到实际文字内容上**：落地坐标从「行元素盒」改为「紧凑文本边界」（`Range.getClientRects()`），cluster 落在文字本身的中心，而不是行间距上。
- **撞击更活泼**：落地增加冲击环、屏幕轻微震动、更密的径向粒子爆发，并把文本行拆成字符四散。
- **修复 `cleanupParents` 提前淡出（BREAKING 语义）**：不再把「不在 `s.rows` 里的子 collider」当作已处理，避免可见行撞完后整张卡（含视口外内容）被提前淡掉。

## Capabilities

### New Capabilities

（无新增 capability——本变更是对既有过渡动画行为的修正。）

### Modified Capabilities

- `chat-dashboard-transition`: cascade 目标从「可见 `[data-collider]` 行」改为「全文所有行 + 自动滚动 + 紧凑文本落地 + 活泼撞击」；`cleanupParents` 的父容器销毁判定不再把视口外子项视为已处理。

## Impact

- **Web 前端**：`web/src/components/TransitionCanvas.tsx` —— `buildRowList()` 改为内容坐标全文收集、新增 `autoScroll()`、`spawnImpact()`/撞击效果增强、`strikeRow()`/`destroyByType()` 字符四散、`cleanupParents()` 判定修复。
- **动画逻辑**：`web/src/animation/cascade.ts` —— `selectNextCascadeRowIndex()` 改为跨全文选下一未撞行（不再受视口高度裁剪）。
- **类型**：`web/src/animation/types.ts` —— 为行增加紧凑文本边界字段（`contentTop/contentBottom/contentLeft/contentRight`）。
- **视觉依据**：explore 阶段生成并经用户确认的自包含 HTML 原型（apply 完成后已删除）。
