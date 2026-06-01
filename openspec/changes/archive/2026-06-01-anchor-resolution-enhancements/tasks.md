## 1. Low-Entropy Tolerance

- [x] 1.1 修改 `validateOperations` 低熵检查：仅当 `totalCandidates > 1 && occurrence === undefined` 时拒绝
- [x] 1.2 通过 `ctx.displayIndex` + `ctx.resolutionMap` 计算 hash 的候选总数

## 2. Numbered Occurrence Errors

- [x] 2.1 歧义错误信息中为每个候选行添加 `#N` 编号
- [x] 2.2 更新 hint 文字："use occurrence field to target the correct match (e.g., occurrence: 3 for #3 above)"

## 3. Proximity-Based Range Resolution

- [x] 3.1 实现 `tryProximityResolve` 函数
- [x] 3.2 start 歧义 → 找 ≤ end 的最近候选；end 歧义 → 找 ≥ start 的最近候选
- [x] 3.3 成功后从 `ambiguousAnchors` 移除、加入 `resolvedMap`

## 4. Sanity Check Precision

- [x] 4.1 构建 `oldHashSet`（oldLines 所有非空行的 hash）
- [x] 4.2 duplicate_line 仅检查 `!oldHashSet.has(h)` 的全新行
- [x] 4.3 delimiter balance 改为全文件 old/new 数量对比（net delta）
- [x] 4.4 orphan fragment 仅检查 `oldHashSet` 中不存在的全新行

## 5. Tests

- [x] 5.1 `tests/drivers/edit.test.ts` 50 tests pass
- [x] 5.2 `tests/checkpoint/checkpoint-manager.test.ts` 32 tests pass
