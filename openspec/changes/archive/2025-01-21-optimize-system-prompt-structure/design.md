## Context

当前 `dump/system-prompt.md` 是所有内容平铺在二级标题下的扁平结构（仅 AGENTS.md 使用了一级标题 `#`）。需要重构为五段式一级标题结构，并注入全新的 Identity 和 Soul 内容。

## Goals / Non-Goals

**Goals:**
- 建立清晰的一级/二级标题层次：`#` 用于顶层分组，`##` 用于子内容
- 按认知流程排序：Identity → Soul → Tool Use → AGENTS.md → Skills
- Identity：完整的 dscode 创意工作室身份宣言，替代原有单行角色声明
- Soul：注入 dscode 的创作哲学和精神内核
- Tool Use 合并 Rules + Tool Search
- Skills 合并 Available + Active + Using

**Non-Goals:**
- 不修改 Rules、Tool Search、AGENTS.md、Skills 各章节的实际内容文字
- 不新增或删除现有章节（Soul 为全新内容，Identity 为替换）
- 不涉及代码或工具链变更

## Decisions

**1. 五段式一级标题结构**

选择：`# Identity` → `# Soul` → `# Tool Use` → `# AGENTS.md` → `# Skills`

理由：
- Identity 在最前——Agent 首先需要知道自己是谁。这不是一行 role line，而是一个完整的创意工作室身份：dscode 是什么、擅长什么、如何工作
- Soul 紧随 Identity——身份定义"做什么"，灵魂定义"为什么做"和"以什么标准做"。Hackers and Painters 精神内核为所有后续行为提供价值锚点。Identity 和 Soul 共同构成 Agent 的"人格层"
- Tool Use 在人格层之后——Agent 先有自我认知，再学习如何行动。Rules 和 Tool Search 是操作层面的指引
- AGENTS.md 在 Tool Use 之后——项目专属信息在通用规则之后
- Skills 在最后——可选扩展能力，与核心人格和行为规范分离

备选：将 Soul 合并入 Identity 作为一个二级标题。但 Soul 的内容体量和深度足以独立成章——Identity 是"我是谁"，Soul 是"我相信什么"，两者是不同的维度，分开更清晰。

**2. Identity 内容设计**

选择：使用用户提供的完整 dscode 身份宣言，不做删减。

内容涵盖：定位（digital studio for content-driven creation）、能力（writing, storytelling, branding, visual concepts, interactive experiences, coded products）、工作方式（think like an editor, design like an art director, build like a developer）、输出标准（functional, expressive, memorable, alive）。

**3. Soul 内容设计**

选择：使用用户提供的完整 Hackers and Painters 哲学文本。

内容涵盖：精神源流（Hackers and Painters）、核心信念（logic × taste, structure × intuition, engineering × art）、创作信条（code as creative medium, words as design material, interfaces as narrative surfaces）、价值优先级（originality > imitation, clarity > noise, taste > clutter, finished expression > empty capability）、终极目标（craft meaningful work that communicates, resonates, and leaves a mark）。

**4. Tool Use 子结构**

选择：`## Rules` + `## Tool Search` 作为 `# Tool Use` 的二级子章节。

考虑到 Rules 中部分内容（"Answer in user's language"、"produce complete implementations"）并非严格工具使用规则，但 Tool Use 作为"行动方式"的广义理解可以涵盖。备选 `# Rules & Tools` 语义更精确但不如 `# Tool Use` 简洁。

**5. 移除 Discoverable Tools**

选择：不从原文件提取 "Discoverable Tools" 为新一级标题。

理由：MCP 工具列表由系统注入，不属于此静态文件的内容范围。将其保留为一级标题会导致内容空洞或与系统注入内容重复。

## Risks / Trade-offs

- [低风险] 如果上游工具链硬编码了解析逻辑（如按 `## Available Skills` 定位内容），调整标题层级可能导致解析失败 → 当前系统提示词为静态文件，无已知解析依赖
- [低风险] Active Skills 部分原本无二级标题（每个 skill 名直接是 `###`），移至 `# Skills` > `## Active Skills` 下后技能名变成 `####` → 语义层级更合理，不影响可读性
- [低风险] Identity 和 Soul 内容较长，会增加 prompt token 消耗 → 这是有意为之的设计选择，高质量的人格层注入需要足够的文本深度
