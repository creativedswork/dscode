## Context

系统提示词的 `## Rules` 子章节（`# Tool Use` 下）定义了 Agent 的工具调用行为规则。当前 5 条规则，三个缺口：

1. "execute them one by one" — 与系统支持同一响应中多个 tool call 的实际能力冲突
2. 没有明确文件工具（write_file/edit/read_file）优先于 bash — Agent 可能滥用 sed/cat 操作项目文件
3. 没有要求使用 Skill 前必须 `skill` 激活 — Skill 列表列出但 Agent 可能跳过激活直接干活

约束：改动仅限于系统提示词文本，不涉及任何代码、API、或模块逻辑变更。

## Goals / Non-Goals

**Goals:**
- 将并行化规则写入 Rules，消除 "one by one" 与实际能力的矛盾
- 明确文件工具 > bash 的优先级，减少用 bash 操作文件的风险
- 将 Skill 激活纳入强制性规则

**Non-Goals:**
- 不改变 Tool Use 的章节结构（仍是 `## Rules` + `## Tool Search`）
- 不改变 Skills 章节
- 不改变非 Rules 部分的任何内容
- 不引入新的工具或 API

## Decisions

### 并行化表述：独立批量 vs 严格逐个

| 方案 | 描述 |
|------|------|
| A: "execute them one by one" | 当前，强制串行 |
| B: "parallelize independent calls, sequence dependent ones" | **采用** |

理由：方案 B 匹配系统实际能力。一条读文件和另一条读文件无依赖 → 同轮发出。读后编辑有依赖 → 分轮。用「batch in a single response」「sequence across separate responses」明确语义。

### 文件工具偏好：明确列举 vs 笼统说"用安全工具"

| 方案 | 描述 |
|------|------|
| A: "prefer safe file tools" | 太模糊，Agent 不知道哪些是安全的 |
| B: 明确列举 write_file / edit / read_file / grep，禁止 sed / cat / awk | **采用** |

理由：方案 B 给白名单也让 Agent 知道具体禁止什么。同时明确 bash 保留用途（tests, builds, git, package management），避免过度禁止。

### Skill 激活规则位置：放在 Rules vs 放在 Skills 章节

| 方案 | 描述 |
|------|------|
| A: 放在 `## Rules` | 作为强制性行为规则 |
| B: 放在 `# Skills` 的 `## Using Skills` | 放在使用说明区 |

理由：采用方案 A。`## Rules` 是行为契约，Skill 激活是一项行为约束（「必须先激活再执行」），放在 Rules 比其他 Agent 更容易遵守。

## Risks / Trade-offs

- [风险] 并行化规则可能被过度解读，Agent 可能强行并行有隐式依赖的调用 → 缓解：措辞强调 "no mutual dependency"
- [风险] 过度限制 bash 可能让 Agent 在需要快速文件操作时效率下降 → 缓解：明确保留 bash 的合法用途列表，写上 "not sed, cat, or awk on project files" 而非 "never use bash for files"
- [风险] Skill 激活规则可能被忽略（Agent 有时不读完整 Rules）→ 缓解：放在 Rules 前列，紧接在并行化和文件工具偏好之后
