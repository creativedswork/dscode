## ADDED Requirements

### Requirement: 可读默认视图

Trace 块 SHALL 默认以固定可读节点尺寸呈现并支持纵向滚动，节点高度 SHALL 恒定（约 22px），MUST NOT 在加载或全屏时把整棵树等比缩到视口内。`fit view` SHALL 作为手动按钮提供，不再作为默认行为。缩放 SHALL 通过 Ctrl+滚轮或工具栏按钮以光标/视口中心为锚进行。

#### Scenario: 加载默认可读视图
- **WHEN** 用户打开一个含大量节点的 Trace 块
- **THEN** Trace 块 SHALL 以固定节点高度渲染
- **AND** 纵向超出可视区域时 SHALL 可滚动查看
- **AND** SHALL NOT 自动把整棵树缩放适配进视口

#### Scenario: fit view 为手动按钮
- **WHEN** 用户点击 fit view 按钮
- **THEN** 整棵树 SHALL 等比适配到当前画布
- **AND** 用户滚动或缩放后 SHALL 可退出该适配状态

#### Scenario: 缩放锚点
- **WHEN** 用户 Ctrl+滚轮缩放
- **THEN** 树 SHALL 以光标位置为锚放大或缩小
- **AND** 节点与连线的相对位置 SHALL 保持

### Requirement: minimap 总览

Trace 块 SHALL 提供一个 minimap 总览，以缩略形式渲染整棵树的 lane、节点与边，并 SHALL 显示当前可视区域的视口框。用户点击 minimap SHALL 将主画布跳转到对应位置。minimap SHALL 与主画布滚动/缩放保持同步。

#### Scenario: minimap 显示整树与视口框
- **WHEN** Trace 块处于可读滚动视图
- **THEN** minimap SHALL 渲染整棵树的缩略结构
- **AND** SHALL 叠加一个表示当前可视区域的视口框

#### Scenario: 点击 minimap 跳转
- **WHEN** 用户点击 minimap 某位置
- **THEN** 主画布 SHALL 滚动使该位置进入视口中心
- **AND** 视口框 SHALL 更新到新的可视区域

#### Scenario: 视口框随滚动同步
- **WHEN** 用户在主画布滚动或缩放
- **THEN** minimap 视口框 SHALL 实时更新以反映当前可视区域

### Requirement: 线性长链折叠

Trace 块 SHALL 自动折叠「线性长链」——由单子节点、无合并、非分叉的非 agent 节点组成的连续 run（长度 ≥3）——将中间节点折叠为 `⋯N` 提示，保留 run 首尾节点。点击 `⋯N` SHALL 展开该 run，再次点击 SHALL 折叠。折叠 SHALL 只影响当前视图，MUST NOT 改变底层树数据。

#### Scenario: 折叠线性长链
- **WHEN** 一条 Agent 路径含超过阈值的连续 `user→assistant→tool→assistant` 单链
- **THEN** 该链的中间节点 SHALL 折叠为一个 `⋯N` 提示
- **AND** 链的首尾节点 SHALL 保持可见

#### Scenario: 展开与再折叠
- **WHEN** 用户点击一个 `⋯N` 提示
- **THEN** 该 run 的中间节点 SHALL 展开
- **AND** 再次点击 SHALL 重新折叠
- **AND** 底层 Trace 树数据 SHALL 不变

#### Scenario: 合并目标节点不被折叠
- **WHEN** 一个线性 run 的末尾节点是 SubAgent 的合并目标（merge target）
- **THEN** 该节点 SHALL 保持可见
- **AND** SubAgent 结束的虚线合并边 SHALL 不断裂

### Requirement: lane 复用

Trace 投影的 lane 分配 SHALL 在 SubAgent 分叉时分配空闲 lane、在该 SubAgent 子树结束（合并回父路径）后回收该 lane。横向 lane 数 SHALL 等于最大嵌套深度而非 Agent 总数。节点的 Agent 归属 SHALL 仍以 `ownerAgentId` 承载，不受 lane 复用影响。

#### Scenario: 兄弟 SubAgent 复用 lane
- **WHEN** Main Agent 依次 spawn 两个非嵌套的 SubAgent
- **THEN** 两个 SubAgent 的路径 SHALL 复用同一条 lane
- **AND** 横向 lane 数 SHALL 不随 SubAgent 数量线性增长

#### Scenario: 嵌套 SubAgent 独占新 lane
- **WHEN** 一个 SubAgent 内部嵌套 spawn 另一个 SubAgent
- **THEN** 内层 SubAgent SHALL 分配到新的 lane
- **AND** 外层 SubAgent 结束前 SHALL 不与内层共用该 lane

#### Scenario: 归属不受 lane 复用影响
- **WHEN** 两个 SubAgent 复用了同一条 lane
- **THEN** 每个节点的 `ownerAgentId` SHALL 仍指向其所属 Agent
- **AND** 按 Agent 筛选与节点详情 SHALL 不受影响

### Requirement: 内容自适应宽度

Trace widget SHALL 适配其内容宽度而非铺满整个 UI 宽：容器宽度 SHALL 收缩到内容自然宽，并 SHALL 以可用宽封顶。画布宽度 SHALL 等于 `min(内容自然宽 × 缩放, 可用宽)`，仅当树真实超宽时 SHALL 出现横向滚动。minimap/详情面板 SHALL 作为内容宽度的一部分。

#### Scenario: 窄树收缩到内容宽
- **WHEN** 树经 lane 复用后只有少数 lane（内容自然宽小于可用宽）
- **THEN** widget 容器 SHALL 收缩到内容自然宽
- **AND** SHALL NOT 铺满整个 UI 宽

#### Scenario: 超宽树封顶并横向滚动
- **WHEN** 树内容自然宽超过可用宽
- **THEN** widget 容器 SHALL 以可用宽封顶
- **AND** 画布 SHALL 提供横向滚动

#### Scenario: 缩放影响画布宽
- **WHEN** 用户放大（zoom > 1）
- **THEN** 画布内容宽 SHALL 按缩放比例增长
- **AND** 超过可用宽时 SHALL 出现横向滚动

### Requirement: 交互与大树性能保护保留

本变更 SHALL 保留既有交互：节点点击详情、日期过滤、按 Agent 筛选、折叠、全屏、亮暗主题，以及大树深度折叠与截断保护。新增的 minimap 与线性折叠 SHALL NOT 破坏这些能力。

#### Scenario: 既有点击详情
- **WHEN** 用户点击一个可见节点
- **THEN** 详情面板 SHALL 展示该节点的类型相关信息

#### Scenario: 既有过滤与全屏
- **WHEN** 用户应用日期或 Agent 过滤，或切换全屏
- **THEN** Trace 块 SHALL 正确过滤/展开
- **AND** minimap 与视口框 SHALL 随过滤结果更新

#### Scenario: 大树性能
- **WHEN** Trace 树包含超过阈值的深层分支
- **THEN** 首屏 SHALL 默认折叠超过阈值的层级
- **AND** minimap 与线性折叠 SHALL 不引入新的布局卡顿
