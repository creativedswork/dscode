## Context

`generateDashboardHTML()` 在 `src/eval/dashboard.ts` 中通过三个独立的代码块渲染同一套 `result.rules` 数据，导致 HTML 输出中出现重复的 "Harness Rules" 区块。

历史原因：`eval-recovery-arc` change 在迭代 Block 1（lines 412–459）增加 category 分组、merge tracking 等功能时，未删除旧的 Block 2（lines 460–482）和 Block 3（lines 483–492），导致三份代码并存。

## Goals / Non-Goals

**Goals:**
- 删除 Block 2（lines 460–482）和 Block 3（lines 483–492），仅保留 Block 1
- 保证修改后 HTML 输出中 "Harness Rules" 区块仅出现一次
- 不改变任何行为逻辑或数据结构

**Non-Goals:**
- 不修改 `EvalResult` schema
- 不修改 rule extraction 或 merge pipeline
- 不新增功能或 UI

## Decisions

**Decision: 保留 Block 1，删除 Block 2+3**

Block 1 是三份代码中功能最完整的版本：
- 按 `category` 分组渲染（`# Identity / Soul`, `# Tool Use Rules` 等）
- 显示 `evidence` 计数和 cross-session 合并信息
- 包含 severity badge (ERROR/WARN/INFO)
- 可折叠的 `rawDescription` 详情
- 完整的 `suggestion` 渲染（含 action、proposed、rationale）

Block 2 缺少 category 分组和 merge tracking；Block 3 仅为简单列表且硬编码英文文本。两者均为 Block 1 的退化版本。

**Alternatives considered:**
- 合并三个 block 的功能到一个 → 不必要，Block 1 已包含所有能力
- 重构为独立函数 → 超出此 fix 的 scope，可作为后续优化

## Risks / Trade-offs

- **No risk**: 纯删除重复代码，不改变任何逻辑路径
- **验证**: 运行 `/eval` 后检查 HTML 输出，"Harness Rules" 区块应仅出现一次
