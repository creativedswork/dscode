## 变更综述

Session Dashboard 从独立 HTML artifact 视图逐步演进出 Chat → Dashboard 的品牌化 Canvas 转场。后续修复依次补齐了 collider 覆盖、父容器递归清理、行重排、内层滚动和 Markdown 完整渲染。本次变更在真实长会话中完成最终校准：统一滚动内容坐标与 Canvas 坐标，将文本块拆成真实视觉行，逐行裁剪且不改变盒模型，并稳定 Markdown renderer 的 React 身份，避免 artifact 流式更新让动画引用失效。

## 变更时间线

- 2025-01-16: `fix-cascade-row-reorder` — DOM 变化后重新排序行，避免 cluster 回跳。
- 2025-01-21: `session-dashboard` — 引入 artifact 管线、Dashboard 视图和 Chat/Dashboard 切换。
- 2026-06-23: `session-dashboard-cache` — 以 session content hash 缓存 Dashboard，缓存命中时跳过生成。
- 2026-06-26: `chat-to-dashboard-transition` — 建立 cascade → gather → formed Canvas 转场。
- 2026-07-03: `fix-cascade-collider-coverage` — 补齐 ToolCard collider，并减少破坏性 DOM 变异。
- 2026-07-03: `fix-cascade-parent-cleanup-recurse` — 子元素完成后递归清理外层卡片。
- 2026-07-03: `fix-dashboard-transition-cluster-jump` — 避免 DOM 变化后的 cluster Y 跳跃。
- 2026-07-03: `fix-inner-scroll-drift` — 修复内层滚动容器在碰撞过程中的位置漂移。
- 2026-07-11: `chat-dashboard-transition` — 将 thinking block 和 timestamp 纳入分级消散。
- 2026-07-27: `fix-markdown-line-split` — 恢复单次 Markdown 渲染，避免按换行切碎语法结构。
- 2026-08-23: `fix-cascade-coordinate-mismatch` — 修复真实视觉行、滚动起点、DOM 身份和 Canvas 落点一致性。

## 初始设计

最初的 Session Dashboard 通过 WebSocket artifact 协议流式生成 HTML，并在沙箱 iframe 中展示。Chat 与 Dashboard 互斥渲染，Dashboard 输入作为 artifact 更新指令，不进入聊天历史。

随后加入的转场以透明 `TransitionCanvas` 覆盖仍挂载的 ChatView：`dscode` 字母 cluster 逐项撞击 DOM collider，内容转为粒子，再重组为 DSCode wordmark；artifact 同时生成，formed 阶段等待内容就绪后完成切换。

## 变更记录

### 变更: Dashboard 缓存与切换语义
- **触发**: 重复切换会重新生成相同 Dashboard，切换 session 后还可能显示旧内容。
- **改动**: 以 `contentHash` 缓存 Dashboard；session 改变时回到 Chat；缓存命中直接显示。
- **影响**: `App` 的 view mode、localStorage cache 和后端 session metadata。

### 变更: Collider 覆盖与非破坏性消散
- **触发**: ToolCard 内容被跳过，`innerHTML` 替换造成布局漂移。
- **改动**: 补齐 tool/card/result collider，改用 overlay、opacity 和 clip-path 保持盒模型。
- **影响**: `TransitionCanvas`、`ToolCard`、`ChatView`、`Markdown`。

### 变更: Markdown 单实例渲染
- **触发**: 按 `\n` 分割 Markdown 破坏代码块、列表、表格和引用。
- **改动**: 每条消息只渲染一个 Markdown 树，在内部标记 collider。
- **影响**: Markdown 语义恢复，但长块元素开始承载多条视觉行。

### 变更: Thinking 与时间戳分级反馈
- **触发**: thinking block 和 timestamp 未参与转场，留下视觉残留。
- **改动**: thinking block 主动消散，timestamp 按 cluster 距离被动溶解。
- **影响**: collider 类型矩阵和 Canvas 粒子反馈。

## 修复记录

### 修复: 行顺序、cluster 跳跃与内层滚动漂移
- **症状**: cluster 回跳、跳出视口，内层隐藏内容在动画中上浮。
- **根因**: DOM 变异后使用不稳定的实时盒坐标，且没有保持行顺序和内层 scrollTop。
- **修复**: 使用变异前位置、维护排序、恢复内层滚动，并逐步减少破坏性 DOM 修改。

### 修复: 父卡片残留
- **症状**: 内层 tool card 完成后，外层 message card 空壳仍可见。
- **根因**: cleanup 只检查最近祖先，没有递归检查容器链。
- **修复**: 自底向上检查祖先，仅在全部子 collider 完成后清理。

### 修复: 真实 App 落点与可见内容不一致
- **症状**: cluster 穿过可见聊天文本，落点处内容不消失；长段落只在整体中心响应。
- **根因**: Canvas/滚动容器坐标假设不显式；文本块的全部 Range rect 被合并；转场从底部滚动位置启动；artifact delta 重渲染时 Markdown renderer 类型变化，导致 collider DOM 重挂载，动画持有失效节点。
- **修复**: 显式应用 Canvas origin 偏移；从顶部开始并恢复原滚动位置；按 `Range.getClientRects()` 生成视觉行；逐行推进 `clip-path`；父级等待全部虚拟行；memoize Markdown renderer；删除未完成行时可触发的 cascade 超时。

### 修复: 空行误撞、同行重撞与卡片空壳
- **症状**: 空白或嵌套滚动区不可见内容仍产生撞击；inline 字体盒偏差让同一视觉行被撞多次；内容消失后代码框或卡片外壳残留；长卡片逐行处理耗时过长。
- **根因**: Range 直接覆盖整个元素，缺少 Text node 非空与嵌套裁剪判断；同行只比较固定 top 容差；父容器完成度在运行时通过 `contains()` 反查，无法形成稳定、幂等的生命周期。
- **修复**: 只采集非空 Text node 并按嵌套裁剪祖先求交；按 60% 垂直重叠率和 owner 合并视觉行；初始化父 collider 链与 pending 计数；代码块和表格增加父 collider；8 行以上 owner 在 3 次直接命中后进入 480ms 向心吸入，完成后再继续遍历。

## 最终状态

- 行坐标统一存储为聊天滚动容器内容坐标，Canvas 绘制与 impact 均应用实时 origin 偏移。
- `scrollContainerRef` 为首选坐标来源；fallback 从 collider 的可滚动祖先解析，不使用 Canvas 假坐标。
- 每条真实渲染文本行独立碰撞，同一 DOM 元素可对应多个 `CascadeRow`。
- 撞击通过递增 `clip-path` 只隐藏当前及此前行，不删除 React 节点、不改变布局尺寸。
- Markdown renderer 在 `isStreaming` 不变时保持组件身份稳定，artifact delta 不再替换 collider DOM。
- cascade 保存原始 `scrollTop`、从 0 开始自动滚动，并在 cleanup 恢复。
- 正常路径只在无未撞行时进入 gather；Escape 仍可由用户显式跳过。
- 真实会话验收得到 1485 个视觉行目标；同一段落裁剪边界连续推进 `21 → 44 → 69px`；采样碰撞 X 误差不超过 `0.8px`，Y 误差处于 22px 字形接触范围内；亮暗主题均使用正确 token。
- 空内容和嵌套裁剪内容不再生成撞击目标；同行 fragment 只产生一次 impact。
- 父 collider 由初始化计数驱动且只销毁一次；代码框、表格和卡片不再留下空壳。
- 长内容 owner 的直接命中上限为 3，随后用向心星尘收束剩余内容；吸入态完成前不会进入 gather。
