## Why

当前 `dump/system-prompt.md` 头部结构扁平，所有内容都使用二级标题（`##`），缺乏一级标题（`#`）作为顶层分组，层次不清、阅读顺序混乱。同时，当前的角色声明仅有一行简短描述，缺乏完整的身份宣言和创作哲学注入，Agent 缺少清晰的自我认知和灵魂内核。

## What Changes

- 引入一级标题（`#`）作为顶层分组，二级标题（`##`）作为子分组
- 章节顺序调整为：Identity → Soul → Tool Use → AGENTS.md → Skills
- **Identity**：替换原有一行角色声明，注入完整的 dscode 创意工作室身份宣言——明确其作为数字创意工作室的定位、能力和工作方式
- **Soul**：新增章节，注入 dscode 的精神内核——以 Hackers and Painters 为精神源流，定义其创作哲学、价值取向和终极目标
- **Tool Use**：将 Rules 和 Tool Search 合并为一个一级标题，作为其二级子章节
- **AGENTS.md**：保持原有内容，位置调整到 Tool Use 之后
- **Skills**：将 Available Skills、Active Skills、Using Skills 合并为一个一级标题，各部分作为二级子章节
- 移除原计划中的 "Other"/"Discoverable Tools" 章节（该内容由系统注入，不属于此文件）

## Capabilities

### New Capabilities

- `system-prompt-structure`: 定义系统提示词文件的层级结构规范——一级标题的命名、顺序、包含的二级子章节，以及 Identity 和 Soul 的完整内容规范

### Modified Capabilities

<!-- 无现有 spec 涉及 -->

## Impact

- 影响文件：`dump/system-prompt.md`（唯一需要修改的文件）
- 无代码、API、依赖变更
- Identity 和 Soul 内容是全新的，不依赖现有文件内容
- 后续生成系统提示词的代码（如有）可能需要适配新的结构层级和新增章节
