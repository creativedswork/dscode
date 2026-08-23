## 变更综述

Chat → Session Dashboard 的转场动画（`chat-dashboard-transition` capability）起源于 2026-06-26 的 `chat-to-dashboard-transition`：在透明 Canvas 覆盖层上运行三段式状态机（cascade → gather → formed），用六字母 "dscode" cluster 逐行撞击聊天 DOM、把内容拆解成粒子，再重组成品牌字标。此后经历了一轮密集的 cascade 稳定性修复（撞击后行重排、ToolCard collider 覆盖与 clone+overlay 打击、父卡递归清理、内层滚动容器 scrollTop 漂移、inline→inline-block 导致的 cluster 跳位）与一次交互层级增强（thinking block 纳入打击、timestamp 近距离溶解），最终收敛到本次 `fix-transition-incomplete-strike`：解决「cascade 只撞当前视口内的行、视口外内容被一刀清空」的核心缺陷——改为全文撞击 + 自动滚动 + 落到紧凑文本边界 + 更活泼的撞击反馈，并修复 `cleanupParents` 的提前淡出。

## 变更时间线

- 2025-01-16: fix-cascade-row-reorder — 撞击后重排 `rows[]`，避免 cluster 跳到视觉顺序错位的行
- 2026-06-26: chat-to-dashboard-transition — 引入三段式 cascade 转场动画（初始设计）
- 2026-07-03: fix-cascade-collider-coverage — 补全 ToolCard collider、打击改 clone+overlay、对齐 launchHop 过滤
- 2026-07-03: fix-cascade-parent-cleanup-recurse — 父卡递归清理，消除残留气泡壳
- 2026-07-03: fix-inner-scroll-drift — 修复内层滚动容器 scrollTop 累积漂移
- 2026-07-03: fix-dashboard-transition-cluster-jump — 修复 inline→inline-block 导致的 cluster 跳位
- 2026-07-11: chat-dashboard-transition — thinking block 纳入打击、timestamp 近距离溶解（三层交互层级）
- 当前: fix-transition-incomplete-strike — 全文撞击 + 自动滚动 + 文本落地 + 活泼撞击 + cleanupParents 修复（最终状态）

## 初始设计

`chat-to-dashboard-transition` 是最早的 proposal，定义了这条能力线的起点：DSCode 用户在 Chat 与 Dashboard 之间切换时，需要一个有意的转场来承接「deconstruct → reconstruct」的品牌叙事，而非生硬的视觉跳变。

核心方案：
- **TransitionCanvas**：全视口透明 Canvas 覆盖层（z-index 50），在可见的 ChatView DOM 之上运行多阶段粒子物理动画
- **hop-step cluster**：六字母 "dscode" 作为统一撞击体，逐行 cascade 撞击聊天内容，带 squash/stretch 形变与 dwell 停顿
- **DOM 销毁矩阵**：六类 per-type 销毁效果（text-line 散字、code-line 腐化、tool-header 散字、tool-result-line 散字、tool-card clip-path 折叠、message-card 碎裂）
- **三段式状态机**：cascade（逐行撞击销毁 DOM）→ gather（粒子汇聚字标）→ formed（粒子驻留 + 水波微动，等待 dashboard artifact）
- **Dashboard 就绪协调**、**滚动锁定**、**缓存/prefers-reduced-motion 旁路**、**ESC 跳过**

## 变更记录

### 变更: 三层元素交互层级（thinking block 纳入打击 + timestamp 近距离溶解）
- **触发**: thinking block 之前被有意保留、timestamp 残留未处理，破坏了「全量拆解」的一致性叙事
- **改动**: thinking block 纳入主动打击层（温和溶解：opacity 淡出 + 温和粒子，不做暴力散字）；timestamp 在 cluster Y 接近 60px 内时近距离溶解为 accent/muted 粒子；形式化为「Active Strike / Passive Dissolution / Preserved」三层层级
- **影响**: `chat-dashboard-transition` 新增四项需求；改动 `TransitionCanvas.tsx`、`animation/types.ts`、`ChatView.tsx`；无破坏性变更，cascade 主链路不变

## 修复记录

### 修复: 撞击后 `rows[]` 未重排
- **症状**: cluster 撞击后跳到当前视觉位置上方的行（markdown 表格单元格、多行工具结果 span 最明显）
- **根因**: DOM 变异后行位置漂移，但 `rows[]` 从未按新位置重排
- **修复**: `strikeRow()` recalibration 后按 `top` 重排 `rows[]` 并更新 `c.rowIndex`，保证 `launchHop` 始终指向视觉上的下一行

### 修复: ToolCard collider 缺失 + DOM 变异漂移 + launchHop 过滤不一致
- **症状**: ToolCard 外层与可滚动结果区缺少 collider 导致 `destroyToolCard`/`destroyToolResultLine` 成为死代码；DOM 变异打击造成相邻行微小漂移；launchHop 过滤条件与 buildRowList 不一致导致部分可见行被跳过
- **根因**: collider 注入不全；`innerHTML=""` 替换为 scatter span 的 DOM 变异即使配合 layout freeze 仍有漂移；launchHop 视口过滤条件与 buildRowList 不一致
- **修复**: 补全 ToolCard 与 tool-result-line collider；打击从 DOM 变异改为 clone+overlay（原始元素仅 `visibility:hidden` 保留占位）；launchHop 过滤对齐 buildRowList；移除 hideOffscreenColliders；空行跳过打击

### 修复: 父卡残留 / 不递归清理
- **症状**: 含嵌套 tool-card 的消息打完后，外层 message-card 气泡壳残留（空边框）
- **根因**: `strikeRow()` 用单次 `closest()` 只清理最近祖先，内层 tool-card 清理后外层 message-card 永不被重查
- **修复**: 构建 `cardStack` 自底向上递归清理；message-card 作为最终清理祖先时允许 `opacity: 0`

### 修复: 内层滚动容器 scrollTop 漂移
- **症状**: 撞击 `overflow-y:auto/scroll` 内层容器（ToolCard 结果区、代码块 pre）内的行时，内容上浮进入可视区
- **根因**: layout freeze + DOM mutation 导致内层滚动祖先 scrollTop 累积漂移
- **修复**: mutation 前后 snapshot/restore 被撞击元素所在内层滚动祖先的 scrollTop；`hideOffscreenColliders` 对被裁剪的 collider 额外 `opacity:0`

### 修复: cluster 跳位
- **症状**: cluster 撞击第一条 text-line 后跳到视口上方不可见区域
- **根因**: inline→inline-block 转换（非法 HTML 嵌套）触发匿名块盒重构，使 recalibration 的 `getBoundingClientRect().top` 偏移
- **修复**: recalibration 改用 mutation 前 snapshot 的位置值，不再依赖 mutation 后的 getBoundingClientRect

## 最终状态

`fix-transition-incomplete-strike` 是这条能力线的当前交付，修复「撞击不完整」的核心缺陷。

### Why

chat → Session Dashboard 的过渡动画（TransitionCanvas）存在「撞击不完整」缺陷：cascade 阶段只收集**当前视口内**的 `[data-collider]` 行（约 10 行），撞完可见行后 `selectNextCascadeRowIndex()` 返回 `-1` 触发 `startGather()`，把整个滚动容器一刀淡出——视口外已经完整渲染、但从未被撞击的几十行内容瞬间消失。用户感知为「50 行只撞了 10 行，画面就清空进入过渡」。

### What Changes

- **全文撞击（核心修复）**：`buildRowList()` 从「只收集可视区 collider」改为「用内容坐标收集全文所有 collider」，cascade 逐行撞完整段内容，而不是只撞第一屏。
- **自动滚动**：cluster 下探时按需平滑滚动聊天容器，让折叠区之外的每一行都进入视口被撞。
- **撞到实际文字内容上**：落地坐标从「行元素盒」改为「紧凑文本边界」（`Range.getClientRects()`），cluster 落在文字本身的中心，而不是行间距上。
- **撞击更活泼**：落地增加冲击环、屏幕轻微震动、更密的径向粒子爆发，并把文本行拆成字符四散。
- **修复 `cleanupParents` 提前淡出（BREAKING 语义）**：不再把「不在 `s.rows` 里的子 collider」当作已处理，避免可见行撞完后整张卡（含视口外内容）被提前淡掉。

### Capabilities

**Modified Capabilities**

- `chat-dashboard-transition`: cascade 目标从「可见 `[data-collider]` 行」改为「全文所有行 + 自动滚动 + 紧凑文本落地 + 活泼撞击」；`cleanupParents` 的父容器销毁判定不再把视口外子项视为已处理。

### Impact

- **Web 前端**：`web/src/components/TransitionCanvas.tsx` —— `buildRowList()` 改为内容坐标全文收集、新增 `autoScroll()`、`spawnImpact()`/撞击效果增强、`strikeRow()`/`destroyByType()` 字符四散、`cleanupParents()` 判定修复。
- **动画逻辑**：`web/src/animation/cascade.ts` —— `selectNextCascadeRowIndex()` 改为跨全文选下一未撞行（不再受视口高度裁剪）。
- **类型**：`web/src/animation/types.ts` —— 为行增加紧凑文本边界字段（`contentTop/contentBottom/contentLeft/contentRight`）。
- **视觉依据**：explore 阶段生成并经用户确认的自包含 HTML 原型（apply 完成后已删除）。
