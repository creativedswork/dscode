## ADDED Requirements

### Requirement: 轨迹树投影（Agent 根）

系统 SHALL 提供一个后端投影，将当前 Session 的 Main Agent 消息与各 SubAgent 的完整 transcript 投影为一棵以 **Main Agent 为路径根**的轨迹树。投影 MUST NOT 重新执行 Agent，也 MUST NOT 把树节点或 UI 状态追加回 Main Agent context。投影结果 SHALL 保留节点的历史顺序，并为每个节点提供稳定 id 与 ownerAgentId（归属 Agent 身份）。

#### Scenario: 投影当前 Session

- **WHEN** 当前 Session 含 user、assistant（带 tools）与 agent 消息
- **THEN** 系统 SHALL 产出一棵以 Main Agent 节点为根的轨迹树
- **AND** 不触发任何 Agent 进程或 Session 写操作

#### Scenario: 投影只读无副作用

- **WHEN** 轨迹树投影完成
- **THEN** Main Agent context SHALL 保持原有消息不变
- **AND** `agentMessages` 与 Agent Process Table 不被新增或修改

### Requirement: 路径链式嵌套

轨迹树内每个 Agent 的路径 SHALL 按历史对话顺序**链式嵌套**：每个节点的 parent 等于它回应的上一个节点（`user → assistant → tool → assistant → …`）。根 SHALL 为 Agent 节点，路径内的 user/assistant/tool 消息 SHALL 不是平铺兄弟。

#### Scenario: 单轮链式嵌套

- **WHEN** 一个 Agent 路径含 `user → assistant → tool → assistant`
- **THEN** 第一个 assistant 节点 SHALL 是 user 节点的子节点
- **AND** tool 节点 SHALL 是该 assistant 节点的子节点
- **AND** 第二个 assistant 节点 SHALL 是该 tool 节点的子节点

#### Scenario: 多轮连续脊柱

- **WHEN** 一个 Agent 路径含两个 user 轮次
- **THEN** 第二个 user 节点 SHALL 挂在前一轮最后一个节点下
- **AND** 整条路径 SHALL 形成一条连续脊柱

### Requirement: tool 单节点语义

`tool` SHALL 为单节点（call 与 result 合并），不拆分为独立的 `tool_call` 与 `tool_result` 节点。同一 assistant 的多个 tool SHALL 为兄弟节点，链 SHALL 从最后一个 tool 节点继续。

#### Scenario: 合并 call 与 result

- **WHEN** 一个 tool 既有 call 参数又有 result
- **THEN** 该 tool SHALL 呈现为单个节点
- **AND** 其详情 SHALL 分区展示 args 与 result

#### Scenario: 多 tool 时链从最后一个继续

- **WHEN** 一个 assistant 携带两个 tool
- **THEN** 这两个 tool 节点 SHALL 是该 assistant 的兄弟子节点
- **AND** 下一个消息节点 SHALL 挂在最后一个 tool 节点下

### Requirement: SubAgent 分叉与并回

`spawn_agent` tool 节点 SHALL 分叉出一个 `agent` 节点作为 SubAgent 的独立路径根。SubAgent 路径 SHALL 按链式嵌套规则展开其内部消息。SubAgent 路径结束 SHALL 以**并回主 lane**的视觉表示控制权回到父路径，投影 SHALL 不再产生 merge 数据关系。嵌套 SubAgent SHALL 递归分叉。

#### Scenario: SubAgent 分叉独立路径

- **WHEN** Main Agent 的 `spawn_agent` tool 生成了一个 SubAgent
- **THEN** 该 SubAgent 的 `agent` 节点 SHALL 成为该 `spawn_agent` tool 节点的子节点
- **AND** SubAgent 内部的 user/assistant/tool SHALL 链式嵌套在该 `agent` 节点下

#### Scenario: SubAgent 结束并回父路径

- **WHEN** SubAgent 路径结束
- **THEN** 渲染 SHALL 以并回主 lane 表示控制权回到父路径
- **AND** 投影 SHALL 不产生 merge 数据关系
- **AND** 父路径 SHALL 从下一个消息节点继续

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

`agent` 节点 SHALL 展示用户可见角色 label 而非内部 Application 名称，并 SHALL 携带 application、state、input/output 摘要。Agent 节点自身的 tool timeline SHALL 展开为其链式路径中的 tool 子节点。

#### Scenario: Agent 角色 label

- **WHEN** Agent 的 Application 为 `general` 且委派描述为 `Researcher: verify claims`
- **THEN** 节点 label SHALL 显示 `Researcher` 而非 `general`

### Requirement: 轨迹树渲染

轨迹树 SHALL 以「节点 + 父→子细边」树式渲染：节点 SHALL 按 kind 形状区分（agent=菱形、user=空心圆、assistant=实心点、tool=方块），边 SHALL 为父节点到子节点的细曲线，Main Agent SHALL 为根（带根标记）。SubAgent spawn SHALL 从 spawn 工具点向右分出新 lane，结束 SHALL 以实线并回主 lane。lane SHALL 按 Agent 着色区分。

#### Scenario: 多 lane 分叉

- **WHEN** 树中存在 Main 与两个 SubAgent
- **THEN** 渲染 SHALL 产出多条 lane
- **AND** 每条 lane 的颜色 SHALL 可区分

#### Scenario: spawn 分叉与结束并回

- **WHEN** 一个 SubAgent 从 spawn 点分叉并结束
- **THEN** 渲染 SHALL 从 spawn 工具点向右画出分叉边
- **AND** SubAgent 结束处 SHALL 以实线并回主 lane（非虚线 merge）

#### Scenario: 节点视觉区分

- **WHEN** 树中同时存在 agent 与 tool 节点
- **THEN** agent 节点 SHALL 以菱形突出
- **AND** tool 节点 SHALL 以方块区分，不与 agent 混同

#### Scenario: Main Agent 为根

- **WHEN** 轨迹树渲染
- **THEN** Main Agent 节点 SHALL 以根标记突出

### Requirement: 节点详情面板

点击任意节点 SHALL 在详情面板展示该类型的具体信息。消息节点 SHALL 展示正文与 thinking；tool 节点 SHALL 分区展示 name、args 与 result 摘要；agent 节点 SHALL 展示 application、role label、state、input/output。大 result SHALL 默认折叠完整内容。

#### Scenario: 点击 tool 节点

- **WHEN** 用户点击一个 tool 节点
- **THEN** 详情面板 SHALL 展示 tool name、args 与 result 摘要
- **AND** result 超过摘要长度时 SHALL 默认折叠并可展开

#### Scenario: 点击 agent 节点

- **WHEN** 用户点击一个 agent 节点
- **THEN** 详情面板 SHALL 展示 role label、application、state、input/output
- **AND** 不以内部 Application 名称作为主标题

### Requirement: 路径高亮交互

点击节点 SHALL 高亮该节点 + 其祖先 + 其后代；其余节点 SHALL 保持正常显示，MUST NOT 降低透明度。点击另一节点 SHALL 切换高亮到新节点。

#### Scenario: 点击节点高亮路径

- **WHEN** 用户点击一个节点
- **THEN** 该节点 SHALL 高亮
- **AND** 其祖先与后代 SHALL 以弱高亮显示
- **AND** 其余节点 SHALL 保持正常显示（不降低透明度）

#### Scenario: 切换高亮

- **WHEN** 用户点击另一个节点
- **THEN** 高亮 SHALL 切换到新节点及其祖先、后代
- **AND** 之前高亮的节点恢复为正常显示

### Requirement: 清除选择

系统 SHALL 提供清除选择入口。`Esc`、点击空白、再次点击已选节点、工具栏清除按钮、详情面板清除按钮 SHALL 任一触发清除选择并恢复为无高亮状态。

#### Scenario: 任一清除操作恢复无高亮

- **WHEN** 用户执行任一清除选择操作（Esc / 点击空白 / 再次点击 / 清除按钮）
- **THEN** 选择 SHALL 被清除
- **AND** 所有节点 SHALL 恢复为无高亮状态

### Requirement: 空态

当当前 Session 无可投影消息时，轨迹树 SHALL 展示明确的空态，而不是渲染空画布或报错。

#### Scenario: 空 Session 空态

- **WHEN** 当前 Session 没有可投影消息
- **THEN** 轨迹树 SHALL 展示空态说明
- **AND** 不渲染空树或抛出异常

### Requirement: 可读滚动布局

轨迹树 SHALL 以固定节点尺寸的纵向布局呈现，超出视口 SHALL 提供纵向与横向滚动。渲染 SHALL 不提供缩放、平移、minimap 或全屏控件。

#### Scenario: 大树滚动

- **WHEN** 轨迹树超出视口
- **THEN** 容器 SHALL 提供纵向与横向滚动
- **AND** 不渲染缩放/平移/minimap/全屏控件
