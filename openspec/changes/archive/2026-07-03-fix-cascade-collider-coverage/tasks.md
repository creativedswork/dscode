## 1. ToolCard collider 铺设

- [x] 1.1 ToolCard 外层 `<div>` 添加 `data-collider="tool-card"`，保留现有 className 和 style
- [x] 1.2 ToolCard 结果区 `displayText` 按 `\n` 拆分，逐行包裹 `<span data-collider="tool-result-line"><Markdown>...</Markdown></span>`（空行用 `<br/>`），与 ChatView text-line 模式一致

## 2. Clone+Overlay 实现

- [x] 2.1 重构 `destroyTextLine()`：原创子元素 `visibility: hidden`；创建 `cloneNode(true)`，absolute overlay 置于 el 内部；在 clone 上执行现有 scatter 动画；450ms 后 el opacity→0 + 清理 clone + 移除 style
- [x] 2.2 重构 `destroyCodeLine()`：同上 clone+overlay 模式，corrupt 动画在 clone 上执行；400ms 后清理
- [x] 2.3 重构 `destroyToolHeader()`：同上 clone+overlay 模式；380ms 后清理
- [x] 2.4 重构 `destroyToolResultLine()`：同上 clone+overlay 模式；330ms 后清理
- [x] 2.5 `destroyToolCard()` 保留现有 clip-path 逻辑不变（无 DOM 变异，无需改）
- [x] 2.6 `destroyMessageCard()` 保留现有 flash+shard 逻辑不变（无 DOM 变异，无需改）
- [x] 2.7 空行处理：`destroyTextLine` 中 `textContent.trim() === ""` 时跳过 clone，直接 el opacity→0
- [x] 2.8 删除三个 destroy 函数的 `innerHTML = ""` 调用及相关的 content 重建逻辑

## 3. strikeRow 简化

- [x] 3.1 删除 display inline→inline-block 切换逻辑（`cs.display === "inline"` 分支）
- [x] 3.2 删除 height/box-sizing/margin/padding/lineHeight 锁定
- [x] 3.3 删除 compensateDy/compensateDx 计算和应用（transform 仅保留 shake dx/dy，应用在 clone 上）
- [x] 3.4 删除 innerScrollAncestor.scrollTop snapshot/restore（DOM 不变异，scrollHeight 不变）
- [x] 3.5 删除 recalibrate 中 struck row 使用 preFreezeTop 的特殊逻辑，改为直接读取 live 位置
- [x] 3.6 删除 preFreezeCanvasRect/preFreezeRect/preFreezeTop/preFreezeLeft 相关变量（仅保留用于 tool-card/message-card 的 impact 坐标计算）

## 4. launchHop 和 hideOffscreenColliders 修复

- [x] 4.1 `launchHop()` 中 `candidateTop < 0` 替换为 `candidateRect.bottom - canvasRect.top <= 0`（与 buildRowList 一致）
- [x] 4.2 删除 `hideOffscreenColliders()` 函数定义
- [x] 4.3 删除 `firstFrame()` 中对 `hideOffscreenColliders()` 的调用

## 5. Spec 更新

- [x] 5.1 更新 `openspec/specs/chat-dashboard-transition/spec.md`：覆盖 specs/ delta 中的 ADDED / MODIFIED / REMOVED 需求到主 spec
