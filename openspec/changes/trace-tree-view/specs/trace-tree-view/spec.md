## ADDED Requirements

### Requirement: Trace 树投影（后端、Agent 根）

系统 SHALL 提供一个后端投影，将当前 Session 的 Main Agent 消息与各 SubAgent 的完整 transcript 投影为一棵以 **Main Agent 为路径根**的 Trace 轨迹树。投影 MUST NOT 重新执行 Agent，也 MUST NOT 把树节点或 UI 状态追加回 Main Agent context。投影结果 SHALL 保留节点的历史顺序，并为每个节点提供稳定 id 与 ownerAgentId（归属 Agent 身份）。

#### Scenario: 投影当前 Session
- **WHEN** 当前 Session 含 user、assistant（带 tools）与 agent 消息
- **THEN** 系统 SHALL 产出一棵以 Main Agent 节点为根的 Trace 树
- **AND** 不触发任何 Agent 进程或 Session 写操作

#### Scenario: 投影只读无副作用
- **WHEN** Trace 树投影完成
- **THEN** Main Agent context SHALL 保持原有消息不变
- **AND** `agentMessages` 与 Agent Process Table 不被新增或修改

### Requirement: 路径链式嵌套

Trace 树内每个 Agent 的路径 SHALL 按历史对话顺序**链式嵌套**：每个节点的 parent 等于它回应的上一个节点（`user → assistant → tool → assistant → …`）。根 SHALL 为 Agent 节点，路径内的 user/assistant/tool 消息 SHALL 不再是平铺兄弟。

#### Scenario: 单轮链式嵌套
- **WHEN** 一个 Agent 路径含 `user → assistant → tool → assistant`
- **THEN** 第一个 assistant 节点 SHALL 是 user 节点的子节点
- **AND** tool 节点 SHALL 是该 assistant 节点的子节点
- **AND** 第二个 assistant 节点 SHALL 是该 tool 节点的子节点

#### Scenario: 多轮连续脊柱
- **WHEN** 一个 Agent 路径含两个 user 轮次
- **THEN** 第二个 user 节点 SHALL 挂在前一轮最后一个节点下
- **AND** 整条路径 SHALL 形成一条连续脊柱而非并列分支

### Requirement: tool 单节点语义

`tool` SHALL 为单节点（call 与 result 合并），不再拆分为独立的 `tool_call` 与 `tool_result` 节点。同一 assistant 的多个 tool SHALL 为兄弟节点，链 SHALL 从最后一个 tool 节点继续。

#### Scenario: 合并 call 与 result
- **WHEN** 一个 tool 既有 call 参数又有 result
- **THEN** 该 tool SHALL 呈现为单个节点
- **AND** 其详情 SHALL 分区展示 args 与 result

#### Scenario: 多 tool 时链从最后一个继续
- **WHEN** 一个 assistant 携带两个 tool
- **THEN** 这两个 tool 节点 SHALL 是该 assistant 的兄弟子节点
- **AND** 下一个消息节点 SHALL 挂在最后一个 tool 节点下

### Requirement: SubAgent 分叉与合并

`spawn_agent` tool 节点 SHALL 分叉出一个 `agent` 节点作为 SubAgent 的独立路径根。SubAgent 路径 SHALL 按链式嵌套规则展开其内部消息，路径结束 SHALL 通过合并关系回到父路径的下一个节点。嵌套 SubAgent SHALL 递归分叉。

#### Scenario: SubAgent 分叉独立路径
- **WHEN** Main Agent 的 `spawn_agent` tool 生成了一个 SubAgent
- **THEN** 该 SubAgent 的 `agent` 节点 SHALL 成为该 `spawn_agent` tool 节点的子节点
- **AND** SubAgent 内部的 user/assistant/tool SHALL 链式嵌套在该 `agent` 节点下

#### Scenario: SubAgent 结束并回父路径
- **WHEN** SubAgent 路径结束
- **THEN** 父路径的下一个消息节点 SHALL 与 SubAgent 路径的最后一个节点建立合并关系
- **AND** 父路径 SHALL 从该下一个消息节点继续

#### Scenario: 嵌套 SubAgent 递归分叉
- **WHEN** 一个 SubAgent 自身 spawn 了另一个 SubAgent
- **THEN** 内层 SubAgent SHALL 从内层 `spawn_agent` tool 节点分叉出独立路径
- **AND** 结束 SHALL 并回外层 SubAgent 的路径

### Requirement: SubAgent transcript 加载

系统 SHALL 加载每个 SubAgent 的完整 transcript（`runtimeSnapshot.messages`）以复现其内部链，并 SHALL 用与 Main Agent 一致的 display-ready 投影处理该 transcript。transcript 缺失时，系统 SHALL 退化为「input → tools → output」摘要呈现，MUST NOT 丢弃节点。

#### Scenario: 加载完整 transcript
- **WHEN** 一个 SubAgent 的 process 记录包含 `runtimeSnapshot.messages`
- **THEN** 系统 SHALL 投影该 transcript 为 SubAgent 的链式路径
- **AND** 该路径 SHALL 包含 SubAgent 内部的 assistant 与 tool 消息

#### Scenario: transcript 缺失退化
- **WHEN** 一个 SubAgent 的 `runtimeSnapshot.messages` 不可得
- **THEN** 系统 SHALL 以 `agentActivity` 的 input/tools/output 呈现该 SubAgent
- **AND** 该节点 SHALL 仍可点击查看详情

### Requirement: Agent 节点内容

`agent` 节点 SHALL 展示用户可见角色 label 而非内部 Application 名称，并 SHALL 携带 application、state、input/output 摘要与 tool timeline。Agent 节点自身的 tool timeline SHALL 展开为其链式路径中的 tool 子节点。

#### Scenario: Agent 角色 label
- **WHEN** Agent 的 Application 为 `general` 且委派描述为 `Researcher: verify claims`
- **THEN** 节点 label SHALL 显示 `Researcher` 而非 `general`

#### Scenario: Agent tool timeline 展开
- **WHEN** Agent 的 tool timeline 含三个 Tool Activity
- **THEN** 该 Agent 节点的路径 SHALL 拥有对应的 tool 节点
- **AND** 不为其生命周期事件创建重复 Agent 节点

### Requirement: git 分支渲染与节点视觉区分

Trace 树 SHALL 以 git 分支可视化渲染：每个 Agent 路径 SHALL 为一条纵向 lane，SubAgent spawn SHALL 从父 lane 向右分叉，结束 SHALL 以虚线并回父 lane。节点 SHALL 按 kind 视觉区分（agent=菱形、user=空心圆、assistant=实心点、tool=方块），lane SHALL 按 Agent 着色区分。渲染 SHALL 默认紧凑密度、少留白。

#### Scenario: lane 对应 Agent 路径
- **WHEN** 树中存在 Main 与两个 SubAgent
- **THEN** 渲染 SHALL 产出三条纵向 lane
- **AND** 每条 lane 的颜色 SHALL 可区分

#### Scenario: spawn 分叉与结束合并
- **WHEN** 一个 SubAgent 从 spawn 点分叉并结束
- **THEN** 渲染 SHALL 从 spawn 工具点向右画出分叉 lane
- **AND** SubAgent 结束处 SHALL 以虚线并回父 lane

#### Scenario: 节点视觉区分
- **WHEN** 树中同时存在 agent 与 tool 节点
- **THEN** agent 节点 SHALL 以菱形突出
- **AND** tool 节点 SHALL 以方块区分，不与 agent 混同

### Requirement: 节点详情面板

点击任意节点 SHALL 在详情面板展示该类型的具体信息。消息节点 SHALL 展示正文与 thinking；tool 节点 SHALL 分区展示 name、args 与 result 摘要（完整 result 按需展开）；agent 节点 SHALL 展示 application、role label、state、input/output、error 与 tool timeline。大 result SHALL 复用摘要并默认折叠完整内容。

#### Scenario: 点击 tool 节点
- **WHEN** 用户点击一个 tool 节点
- **THEN** 详情面板 SHALL 展示 tool name、args 与 result 摘要
- **AND** result 超过摘要长度时 SHALL 默认折叠并可展开

#### Scenario: 点击 agent 节点
- **WHEN** 用户点击一个 agent 节点
- **THEN** 详情面板 SHALL 展示 role label、application、state、input/output 与 tool timeline
- **AND** 不以内部 Application 名称作为主标题

### Requirement: 日期过滤

系统 SHALL 提供起止日期过滤 Trace 树。窗口外的节点 SHALL 被隐藏，但其必要祖先 SHALL 保留为不可点击的弱化占位，以维持树的连通结构；无时间戳的节点（Agent 路径根）SHALL 永不过滤。

#### Scenario: 日期窗口过滤中间节点
- **WHEN** 用户设置起止日期使某个中间节点落在窗口外
- **THEN** 该节点 SHALL 被隐藏
- **AND** 其祖先 SHALL 以弱化占位保留，使下游可见节点不断裂

#### Scenario: 清除日期过滤
- **WHEN** 用户清除起止日期
- **THEN** 树 SHALL 恢复为完整结构
- **AND** 所有节点 SHALL 恢复可点击

### Requirement: 按 Agent 筛选

系统 SHALL 提供按 Agent 筛选 Trace 树。每个节点 SHALL 携带 ownerAgentId（= 所属 lane/Agent）。用户从下拉列表选择一个 Agent 或「全部」时，树 SHALL 只显示该 Agent 拥有的节点，并保留必要祖先作为弱化占位以维持连通；「全部」SHALL 显示完整树。Agent 筛选 SHALL 与日期过滤叠加生效。

#### Scenario: 选择单个 SubAgent
- **WHEN** 用户从下拉列表选择一个 SubAgent
- **THEN** 树 SHALL 只显示该 SubAgent 拥有的节点及其必要祖先占位
- **AND** 其他 Agent 的节点 SHALL 被隐藏

#### Scenario: 选择 Main
- **WHEN** 用户从下拉列表选择 Main
- **THEN** 树 SHALL 只显示 Main 拥有的节点及其必要祖先占位
- **AND** SubAgent 路径 SHALL 被隐藏

#### Scenario: 与日期过滤叠加
- **WHEN** Agent 筛选与日期过滤同时生效
- **THEN** 树 SHALL 只显示同时满足两者的节点
- **AND** 必要祖先 SHALL 以占位保留维持连通

### Requirement: 缩放与平移交互

Trace 块 SHALL 支持以光标为中心的滚轮/触控板缩放与空白处拖拽平移，并 SHALL 提供「fit view」将整棵树适配到视口。缩放 SHALL 保持节点可点击，平移 SHALL 不改变树的层级布局。

#### Scenario: 滚轮缩放
- **WHEN** 用户在树画布上滚动滚轮
- **THEN** 树 SHALL 以光标为中心放大或缩小
- **AND** 节点与连线的相对位置 SHALL 保持

#### Scenario: 拖拽平移
- **WHEN** 用户在空白处按下并拖动
- **THEN** 整棵树 SHALL 随拖拽平移
- **AND** 树的层级与兄弟顺序 SHALL 不变

### Requirement: 折叠与展开

Trace 块 SHALL 支持折叠/展开分支。折叠的分支 SHALL 收起其子树并保留一个明确的展开提示（如 `+N`）；折叠状态 SHALL 只影响当前视图呈现，不改变底层树数据。

#### Scenario: 折叠分支
- **WHEN** 用户折叠一个 SubAgent 分支
- **THEN** 该 SubAgent 的子树 SHALL 收起
- **AND** 节点 SHALL 显示可重新展开的提示

#### Scenario: 展开分支
- **WHEN** 用户展开已折叠的分支
- **THEN** 该分支的子树 SHALL 重新展开
- **AND** 底层 Trace 树数据 SHALL 不变

### Requirement: 点击聚焦高亮

点击某节点时，系统 SHALL 只保留该节点及其子节点为正常显示，其余节点与连线 SHALL 变灰（降低透明度），以突出当前子树。点击另一节点 SHALL 切换聚焦到新节点。

#### Scenario: 点击节点聚焦子树
- **WHEN** 用户点击一个节点
- **THEN** 该节点及其子节点 SHALL 保持正常显示
- **AND** 其余节点与连线 SHALL 变灰

#### Scenario: 切换聚焦
- **WHEN** 用户点击另一个节点
- **THEN** 聚焦 SHALL 切换到新节点及其子节点
- **AND** 之前聚焦的节点恢复为正常显示

### Requirement: Dashboard 内嵌与全屏展示

Trace 块 SHALL 作为 Session Dashboard 视图的一等组成内嵌展示，与 LLM 报告并列。Trace 块 SHALL 提供全屏开关：全屏时覆盖主内容区域，再次点击恢复组合布局。全屏 SHALL 不改变 `viewMode`（仍为 `session_dashboard`）、不触发报告重新生成、不渲染 MessageInput，也不提供修改或回放能力。

#### Scenario: Dashboard 内展示 Trace 块
- **WHEN** 用户在非空 Session 打开 Session Dashboard
- **THEN** Dashboard 视图 SHALL 渲染 Trace 轨迹树块并与 LLM 报告并列
- **AND** 不新增顶层视图模式

#### Scenario: Trace 块全屏展开
- **WHEN** 用户点击 Trace 块的全屏开关
- **THEN** Trace 块 SHALL 覆盖主内容区域
- **AND** 不发送 `artifact` 或 `/eval` 命令
- **AND** `viewMode` SHALL 保持 `session_dashboard`

#### Scenario: 恢复组合布局
- **WHEN** 用户在 Trace 块全屏状态再次点击全屏开关
- **THEN** Trace 块 SHALL 恢复为与 LLM 报告并列的组合布局

### Requirement: 空态与缺数据

当当前 Session 无可投影消息时，Trace 块 SHALL 展示明确的空态，而不是渲染空画布或报错。

#### Scenario: 空 Session 空态
- **WHEN** 当前 Session 没有可投影消息
- **THEN** Trace 块 SHALL 展示空态说明
- **AND** 不渲染空树或抛出异常

### Requirement: 大树性能与深度折叠

系统 SHALL 对深/大 Trace 树默认折叠深层分支，并对超出上限的同屏节点提供截断或虚拟化，避免布局卡顿。

#### Scenario: 深层分支默认折叠
- **WHEN** Trace 树包含超过阈值的深层分支
- **THEN** 首屏 SHALL 默认折叠超过阈值的层级
