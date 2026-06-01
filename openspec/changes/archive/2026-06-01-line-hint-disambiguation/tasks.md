## 1. Schema

- [x] 1.1 给 `ReplaceLineOp`、`InsertAfterOp`、`InsertBeforeOp`、`DeleteLineOp` 加上 `line: Type.Optional(Type.Number())`
- [x] 1.2 更新 `EditOperation` type union 和 `SingleLineOp` 类型，加入 `line?: number`

## 2. Resolution

- [x] 2.1 修改 `resolveAnchor` 签名：接受可选 `line?: number` 参数
- [x] 2.2 实现 line-hint 逻辑：occurrence 之后、error 之前，找 closest candidate
- [x] 2.3 等距歧义时 fall through 到 error（不猜测）

## 3. Validation

- [x] 3.1 修改 `validateOperations` 中单行操作部分：传递 `op.line` 到 `resolveAnchor`
- [x] 3.2 修改 `applyEditOperations` 中单行操作部分：传递 `op.line`

## 4. Tests

- [x] 4.1 测试：唯一 hash + line hint → 正确命中
- [x] 4.2 测试：歧义 hash + line hint → 命中最近候选
- [x] 4.3 测试：歧义 hash + 等距 line hint → 拒绝
- [x] 4.4 测试：歧义 hash + 无 line hint → 保持原有拒绝行为
