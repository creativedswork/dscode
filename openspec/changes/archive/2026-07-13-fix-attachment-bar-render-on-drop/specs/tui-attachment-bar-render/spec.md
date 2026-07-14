## ADDED Requirements

### Requirement: Attachment bar SHALL render immediately when files are attached

当文件通过拖放或其他方式附加到 TUI prompt 时，attachment bar SHALL 在状态更新后立即渲染到终端，无需用户执行额外操作。

#### Scenario: File drop renders attachment bar without extra input
- **WHEN** 用户通过拖放将文件附加到 TUI prompt
- **THEN** attachment bar SHALL 立即显示，显示文件名、滚动提示和清除快捷键
- **AND** 该渲染 SHALL 在文件附加事件发生后的一帧内完成

#### Scenario: Image paste renders status bar without extra input
- **WHEN** 用户粘贴图片到 TUI prompt
- **THEN** image status bar SHALL 立即显示图片数量信息

### Requirement: Arrow keys SHALL control Editor cursor when attachment bar is visible

当 attachment bar 可见时，纯方向键（⬅️➡️）SHALL 控制 Editor 中的光标位置，不被 attachment bar 消费。

#### Scenario: Left/right arrows move cursor with attachment bar visible
- **WHEN** attachment bar 可见且 Editor 中有文本
- **AND** 用户按下 ⬅️ 或 ➡️ 键
- **THEN** 光标 SHALL 在 Editor 文本中按预期方向移动
- **AND** attachment bar SHALL NOT 因方向键而滚动

#### Scenario: Ctrl+Shift+arrows scroll attachment bar
- **WHEN** attachment bar 可见
- **AND** 用户按下 Ctrl+Shift+⬅️ 或 Ctrl+Shift+➡️
- **THEN** attachment bar SHALL 滚动显示更多文件
- **AND** 修改键组合 SHALL NOT 影响 Editor 光标位置

#### Scenario: Arrow keys work normally when no files are attached
- **WHEN** attachment bar 不可见（无文件或图片附加）
- **AND** 用户按下 ⬅️ 或 ➡️ 键
- **THEN** 光标 SHALL 在 Editor 文本中正常移动
