## Why

Chat→Dashboard 转场动画中，集群 cascade 存在三类问题：(1) ToolCard 外层和可滚动结果区缺少 `data-collider` 属性，导致 `destroyToolCard()` 和 `destroyToolResultLine()` 成为死代码、集群跳过整个工具卡内容；(2) 当前 DOM 变异式的打击（`innerHTML = ""` 替换为 scatter spans）即使配合 layout freeze+compensate，仍然造成相邻行微小漂移；(3) `launchHop` 的视口过滤条件与 `buildRowList` 不一致，部分可见行被不一致地跳过。

## What Changes

- **ToolCard 补全 collider**: 外层 div 添加 `data-collider="tool-card"`；可滚动结果区内的 Markdown 每一行添加 `data-collider="tool-result-line"`
- **打击方式从 DOM 变异改为 clone+overlay**: `destroyTextLine`/`destroyToolHeader`/`destroyToolResultLine` 不再修改原始 DOM 的 innerHTML，改为 `cloneNode` + absolute overlay 上运行动画，原始元素仅设置 `visibility: hidden`（保留布局占位）
- **简化 strikeRow**: 删除 inline→inline-block 的 display 切换、height/margin/padding/lineHeight 锁定、compensateDy/Dx 补偿计算、innerScrollTop 快照/恢复——这些因 DOM 变异而生的补偿逻辑在 clone+overlay 方案下不再需要
- **修复 launchHop 过滤**: 将 `candidateTop < 0` 条件改为与 `buildRowList` 一致的 `candidateRect.bottom - canvasRect.top <= 0`（仅跳过完全在画布外的行，部分可见行正常打击）
- **移除 hideOffscreenColliders**: scroll 锁定期间视口外内容天然不可见，不需要额外隐藏
- **空行特殊处理**: `text-line` 内容为 `<br/>`（空行）时跳过打击，不触发 450ms 后闪烁消失

## Capabilities

### Modified Capabilities
- `chat-dashboard-transition`: 修改 "DOM destruction effects matrix" 需求——打击方式从 innerHTML 替换改为 clone+overlay；修改 "Layout freeze before destruction" 需求——删除 inline→inline-block 切换和盒模型锁定；修改 "Scroll locking during animation" 需求——移除 hideOffscreenColliders；修改 "Hop-step cluster cascade" 需求——launchHop 过滤条件与 buildRowList 对齐

## Impact

- `web/src/components/TransitionCanvas.tsx` — strikeRow/launchHop/destroyTextLine/destroyCodeLine/destroyToolHeader/destroyToolResultLine/hideOffscreenColliders/buildRowList
- `web/src/components/ToolCard.tsx` — 外层 div 添加 data-collider="tool-card"，结果区 Markdown 包裹添加 data-collider="tool-result-line"
- `web/src/components/Markdown.tsx` — 新增 `tool-result-line` collider 支持（类似现有 code-line 的逐行包裹）
- `web/src/components/ChatView.tsx` — text-line collider 添加位置修复空行处理
- `openspec/specs/chat-dashboard-transition/spec.md` — 对应需求修改
