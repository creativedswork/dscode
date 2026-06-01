## Why

即使有了 `#N` 编号的歧义错误信息，agent 仍需手动数 `occurrence` 来定位超高频行（如 `cbb184` 是 `}`，在文件中出现 50+ 次）。`read_file` 的输出本身就是 `lineNum#hash` 格式，agent 已经知道目标行号。应该允许 agent 把这个行号作为歧义消解的邻近提示传递，而不是让 agent 自己去数 occurrence。

## What Changes

- 单行编辑操作（`replace_line`、`insert_after`、`insert_before`、`delete_line`）新增可选 `line` 参数
- 当 hash 匹配多个候选行时，`line` 参数作为邻近提示：选择候选行中离 `line` 最近的那个
- `line` 不是 address，仍是 guard-first：只有当候选行中存在与 `line` 提示匹配的才生效
- 不影响现有协议：`line` 为可选参数，不提供时行为不变

## Capabilities

### Modified Capabilities

- `edit-tool`: 单行操作 schema 增加可选 `line: number` 字段
- `disambiguation-protocol`: resolution ladder 增加 line-hint 步骤（在 occurrence 之后、context-augmented 之前）

## Impact

- 修改 `src/drivers/edit.ts`：operation type schemas + `resolveAnchor` 函数
