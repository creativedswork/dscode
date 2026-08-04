## ADDED Requirements

### Requirement: Inline Agent Activity Card

Web conversation SHALL 为 role=agent 的消息渲染内联 Agent Activity Card。卡片
MUST 遵循 editorial workshop design system，并与 user bubble、assistant message
和 ToolCard 保持可辨识的视觉层级。

#### Scenario: Running Agent Card
- **WHEN** role=agent 且 state 为 running
- **THEN** 卡片显示活动状态点、Application、attachment、输入摘要和运行耗时
- **AND** 使用 semantic CSS token，不使用硬编码颜色

#### Scenario: Waiting Agent Card
- **WHEN** Agent Activity state 为 waiting
- **THEN** 卡片显示 waiting 标签和最近 progress message

#### Scenario: Completed Agent Card
- **WHEN** Agent Activity state 为 completed
- **THEN** 卡片显示 completed 状态、固定耗时和 output 摘要

#### Scenario: Failed Agent Card
- **WHEN** Agent Activity state 为 failed、terminated 或 killed
- **THEN** 卡片使用 error 或 muted semantic token 显示终态及错误摘要

### Requirement: Agent Card 折叠详情

Agent Activity Card SHALL 默认折叠完整 output/error。仅当存在超出摘要的详情时
SHALL 显示展开控件，展开和折叠不得改变消息顺序。

#### Scenario: 展开完整输出
- **WHEN** 用户点击带详情的 Agent Card 展开控件
- **THEN** 卡片在原位置显示完整 output/error
- **AND** 详情区域有最大高度与垂直滚动

#### Scenario: 再次折叠
- **WHEN** 用户再次点击展开控件
- **THEN** 卡片恢复摘要状态且对话滚动位置不发生非预期跳跃

### Requirement: Agent Card 可访问性

Agent Activity Card 的状态、展开控件和 progress MUST 可由键盘和辅助技术识别。

#### Scenario: 键盘展开
- **WHEN** 展开控件获得焦点且用户按 Enter 或 Space
- **THEN** 详情展开状态切换
- **AND** 控件的 `aria-expanded` 反映当前状态

#### Scenario: 状态不只依赖颜色
- **WHEN** 卡片显示任意 Agent state
- **THEN** 状态同时使用文本和图标表达，不只通过颜色区分

### Requirement: Agent Card 参与对话布局

Agent Activity Card SHALL 参与现有 scroll、auto-scroll 和 Chat-to-Dashboard
collider 体系，但 MUST NOT 使用 assistant response 的 phase label。

#### Scenario: Activity 到达且用户在底部
- **WHEN** 新 Agent Activity 到达且用户位于对话底部阈值内
- **THEN** conversation 按既有规则自动滚动到新卡片

#### Scenario: 用户已滚离底部
- **WHEN** Agent Activity 更新且用户已滚离底部超过阈值
- **THEN** UI 保持当前滚动位置

#### Scenario: Dashboard transition
- **WHEN** Chat-to-Dashboard transition 扫描 conversation collider
- **THEN** Agent Activity Card 作为独立 card collider 被处理
