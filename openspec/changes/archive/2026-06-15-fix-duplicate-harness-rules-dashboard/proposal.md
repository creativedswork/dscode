## Why

`generateDashboardHTML` 在生成的 HTML 中渲染了 **3 个重复的 "Harness Rules" 区块**，导致 eval dashboard 中同一套 rules 数据被重复展示三次。当 `rules` 为空时，报告中出现三行连续的 "未检测到 Agent 配置问题" 消息，造成信息噪音并违反了 spec 中 "Harness Rules section" 应为单一区块的要求。

## What Changes

- 删除 `src/eval/dashboard.ts` 中 `generateDashboardHTML()` 的第 2、3 个 "Harness Rules" 渲染区块（lines 460–492），仅保留第一个（lines 412–459）完整版本
- 第一个区块已包含完整的按 category 分组、evidence 计数、merge tracking、severity badge 和可折叠详情 — 无需新增功能

## Capabilities

### New Capabilities

（无 — 此 fix 为纯实现层 bug 修复，不引入新能力）

### Modified Capabilities

（无 — 不修改任何 spec 级行为，仅删除重复代码）

## Impact

- **Affected code**: `src/eval/dashboard.ts` — `generateDashboardHTML()` 函数，删除 lines 460–492
- **No API changes, no schema changes, no dependency changes**
