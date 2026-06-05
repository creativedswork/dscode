## 1. 准备工作

- [x] 1.1 确认 git 可回滚 `src/core/harness.ts`

## 2. 写入 Identity 章节

- [x] 2.1 在 `buildSystemPrompt()` 中添加 `# Identity` 一级标题和 dscode 身份宣言
- [x] 2.2 替换原"You are a coding assistant..."为完整 Identity 内容

## 3. 写入 Soul 章节

- [x] 3.1 在 Identity 之后添加 `# Soul` 一级标题和 Hackers and Painters 内容
- [x] 3.2 注入完整 Soul 哲学文本（精神源流、核心信念、创作信条、价值优先级、终极目标）

## 4. 创建 Tool Use 章节

- [x] 4.1 将 Rules 移至 `# Tool Use` 一级标题下作为 `## Rules` 二级子章节
- [x] 4.2 将 Tool Search 移至 `# Tool Use` 一级标题下作为 `## Tool Search` 二级子章节

## 5. 确认 AGENTS.md 章节位置

- [x] 5.1 确保 `# AGENTS.md` 位于 Tool Use 之后、Skills 之前
- [x] 5.2 AGENTS.md 通过 `loadAgentsMd()` 注入，原有内容不变

## 6. 创建 Skills 章节

- [x] 6.1 Available Skills 通过 SkillManager.getSystemPromptSection() 注入 `# Skills` 下
- [x] 6.2 Active Skills 通过 SkillManager 注入，技能名保持 `###` 三级标题
- [x] 6.3 Using Skills 硬编码在 `# Skills` 下作为 `## Using Skills`

## 7. 验证

- [x] 7.1 验证 `buildSystemPrompt()` 输出含 5 个 `#` 标题且顺序正确
- [x] 7.2 Identity 和 Soul 内容完整在模板字符串中
- [x] 7.3 Rules、Tool Search、AGENTS.md、Skills 逻辑与原有内容一致
- [x] 7.4 Discoverable Tools 通过 `__DEFERRED_HINT__` 占位符注入 Tool Use 内，transformContext 中替换
