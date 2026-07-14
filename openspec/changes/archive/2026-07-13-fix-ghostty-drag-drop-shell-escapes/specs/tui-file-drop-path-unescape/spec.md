## ADDED Requirements

### Requirement: File drop path detection SHALL handle shell-style escape sequences

当终端（如 Ghostty）在 bracketed paste 中对文件路径做 shell-style 转义时，路径检测逻辑 SHALL 在 `existsSync` 检查之前反转义这些序列。

#### Scenario: Path with shell-escaped spaces is detected
- **WHEN** 用户拖放路径中包含 shell-escaped 空格的文件（如 `From\ Prompts\ to\ Templates.pdf`）
- **THEN** 系统 SHALL 将 `\ ` 反转义为空格后再执行 `existsSync`
- **AND** 真实文件路径 SHALL 被正确记录到 `FileTracker`
- **AND** `[file:xxx]` placeholder SHALL 正确显示在 editor 中
