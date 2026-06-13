## Context

当前 `/eval` 的 CHIFF pipeline（6 step LLM 分析 + rule engine fallback）产出 `EvalResult`，其中 `suggestions: string[]` 是硬编码在 `analyzer.ts` 中的文案模板，与具体 session 强绑定。我们需要将 eval 从"单 session 诊断"升级为"跨 session Agent 配置优化引擎"——每次 `/eval` 从 session 中提取可复用的 `HarnessRule`，积累到持久化 Rule Store，最终输出针对 dscode System Prompt / Tool Registry / Skills 等配置层的优化建议。

### 架构约束

- `/eval` 命令保持，不引入新 slash command
- Rule Store 位于 `~/.dscode/eval/rules.json`，与 dashboard HTML 同目录
- 规则检测以模板化/统计驱动为主（确定性），LLM 辅助仅用于 `needs_llm: true` 的规则
- 不影响现有 Harness API、session 存储格式、slash command 接口

## Goals / Non-Goals

**Goals:**
- 定义 HarnessRule 类型体系，映射 dscode Agent 配置的每一层
- 实现 CHIFF Step 7（规则抽象）和 Step 8（规则去重与合并）
- 实现跨 session 规则存储与证据累积
- Dashboard 展示规则趋势
- `EvalResult.suggestions` → `EvalResult.rules: HarnessRule[]`

**Non-Goals:**
- 自动应用规则建议（不自动修改 System Prompt / config）
- 实时 Agent 行为监控（eval 仍然是按需触发）
- 规则在 session 中途的干预（不影响 Agent 运行时的行为）
- 跨项目规则聚合（每个 project 独立 Rule Store）

## Decisions

### Decision 1: 规则由模板化检测器生成，而非 LLM

**选择**: 90% 的规则使用 TypeScript 检测器函数（统计 + 模式匹配），仅 `needs_llm: true` 的规则（如 identity drift 检测）才调用 LLM。

**理由**:
- 确定性：同一 session 多次 eval 产出相同规则
- 可测：每个检测器独立单测
- Token 成本：避免为规则抽象额外增加 6 次 LLM 调用
- LLM 仅用于需要语义理解的规则（如 "output lacks editorial voice"）

**替代方案考虑**: 全部用 LLM 生成规则 — 被否决，因为不可复现、token 成本高、难以验证规则质量。

### Decision 2: Rule Store 是本地 JSON，不引入数据库

**选择**: `~/.dscode/eval/rules.json` 存储规则，使用文件读写。

**理由**:
- 简单：无需引入新依赖
- 可读：用户可以直接查看/编辑
- 已有先例：session store 也是本地 JSON
- 数据量小：每个 project 预计 <100 条规则

### Decision 3: 规则分类与 System Prompt 层级一一对应

**选择**: RuleCategory 映射到 `buildSystemPrompt()` 的 5 个层级 + Tool Registry + Skills。

```
RuleCategory → System Prompt Layer
──────────────────────────────────
identity      → # Identity + # Soul
tool_use      → # Tool Use §Rules
tool_registry → ToolRegistry (descriptions, searchHints, classify)
agents_md     → # AGENTS.md
skill         → # Skills
```

**理由**: 确保每条规则的建议直接指向可修改的配置段落，用户能立刻定位。

### Decision 4: EvalResult.suggestions 替换而非共存

**选择**: `suggestions: string[]` 直接替换为 `rules: HarnessRule[]`，不保留兼容字段。

**理由**: suggestions 是临时诊断，rules 是更结构化的超集。向后兼容无意义（dashboard 由同一代码库生成）。breaking change 仅影响 `src/eval/` 内部。

### Decision 5: 规则严重度由跨 session 证据计数驱动

**选择**: 规则 severity 不固定，由 `evidence_count` 动态计算：

| evidence_count | 等级   | 含义                         |
|---------------|--------|------------------------------|
| 1             | INFO   | 偶发，观察                   |
| 3             | WARN   | 模式出现，需要关注           |
| 5+            | ERROR  | 系统性问题，建议持久化到配置 |

**理由**: 单次触发可能是噪音，跨 session 重复出现才是真正的配置缺陷。5 次阈值与 dscode 的典型使用模式（每个 project 10-50 sessions）匹配。

## Risks / Trade-offs

**Risk**: 规则过于抽象导致难以理解
→ **Mitigation**: 每条规则保留 `sampleSteps`（来自最新 session 的具体证据），用户可以看到具体示例

**Risk**: Rule Store 文件损坏导致 eval 失败
→ **Mitigation**: 损坏时用空 store 降级，现有 eval 功能不受影响

**Risk**: 检测器覆盖不全，漏掉重要的配置问题
→ **Mitigation**: 检测器本身也是可迭代的——未来新增检测器只需在 `taxonomy.ts` 注册即可

**Risk**: 阈值 1/3/5 是否合理？
→ **Mitigation**: 阈值硬编码在一个常量对象中，后续可以调整为可配置
