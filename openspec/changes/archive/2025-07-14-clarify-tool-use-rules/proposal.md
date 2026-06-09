## Why

系统提示词 `## Rules` 子章节存在三条规则缺失：未说明独立 tool call 可并行执行（"execute them one by one" 与实际能力矛盾）、未明确文件工具优先于 bash、未要求使用 Skill 前先激活。修正这三个缺口，可减少无效轮次、提升文件操作安全性、保障 Skill 执行质量。

## What Changes

- 将「execute them one by one」替换为并行化规则：独立调用批量发出，有依赖的调用串行
- 新增：prefer write_file / edit / read_file over bash，bash 仅用于构建/测试/git/包管理，禁止用 sed/cat/awk 操作项目文件
- 新增：任务涉及 Skill 领域时，必须先调用 `skill` 工具加载其完整指令再执行

## Capabilities

### Modified Capabilities
- `system-prompt-structure`: Tool Use → Rules 子章节的内容规则变更 — 三条规则替换/新增，不影响章节结构和标题层级

## Impact

- 受影响文件：系统提示词中 `## Rules` 部分（5 条规则 → 8 条规则）
- 无 API 变更、无代码变更、无依赖变更
