## Why

dscode 的 edit 工具在 4.0 层（anchor 解析）存在三类误拒问题，导致 agent 在编辑高频重复行（`}`、`);`、`return;`）时反复失败：

1. **低熵唯一行被拒**：文件中只有一处的 `);` 也被 `anchor_low_entropy` 拒绝
2. **歧义错误信息不足**：hash 匹配 20 处时不告诉 agent 用 occurrence 几
3. **range 端点歧义无自动解析**：一端唯一另一端歧义时直接失败，不会就近匹配
4. **sanity check 上下文窗口过宽**：4 行上下文把预设的重复/括号也标记为错误

## What Changes

- 低熵检查改为仅拒绝**歧义 + 无 occurrence** 的锚点（唯一低熵行允许）
- 歧义错误信息增加 `#1 line N: "..."` 编号，提示 agent 使用 `occurrence` 字段
- range 操作实现 `tryProximityResolve`：唯一端 + 歧义端 → 自动找最近候选
- `runSanityChecks` 改为全文件 delta 对比 + 仅检查 `oldHashSet` 中不存在的全新行

## Capabilities

### Modified Capabilities

- `edit-tool`: 低熵检查放宽、歧义错误信息增强、range 智能解析、sanity check 精度提升
- `disambiguation-protocol`: 新增 proximity-based resolution 作为 resolution ladder 的补充步骤

## Impact

- 修改 `src/drivers/edit.ts`（`validateOperations` / `tryProximityResolve` / `runSanityChecks`）
