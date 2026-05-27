## 1. 歧义消解协议（Phase 1 安全边界）

- [x] 1.1 在 `EditOperation` 类型中为单行操作（replace_line, insert_after, insert_before, delete_line）添加可选 `occurrence?: number` 字段
- [x] 1.2 修改 `validateHashes` 函数，新增歧义检测：对 range 操作，若 start_hash 或 end_hash 匹配多行（`matches.length > 1`）则返回 `anchor_ambiguous` 错误
- [x] 1.3 修改 `validateHashes` 函数，对单行操作：若无 `occurrence` 且 hash 匹配多行则返回 `anchor_ambiguous`；若有 `occurrence` 则校验是否在有效范围内
- [x] 1.4 修改 `applyEditOperations` 函数中单行操作的分发逻辑，使用 `occurrence` 字段（默认 1）确定目标行号
- [x] 1.5 构造 `anchor_ambiguous` 错误返回，details 中包含 `ambiguous_anchors` 数组（每个元素含 `hash` 和 `candidates` 行号列表）和 `suggested_action: "re-read_with_context"`
- [x] 1.6 更新 tool description 中的歧义说明，引导 agent 使用 `occurrence` 字段

## 2. Invalidation Contract（Phase 2 连续编辑闭环）

- [x] 2.1 在 `edit` 成功返回的 details 中添加 `anchors_valid_through` 字段（受影响区域最小行号 - 1，最小为 0）
- [x] 2.2 在 `edit` 成功返回的 details 中添加 `must_refresh_from_line` 字段（受影响区域最小行号）
- [x] 2.3 确保 `generateLocalDiff` 输出中每行包含新 anchor（`lineNumber#hash|content` 格式）——当前已实现，验证正确性
- [x] 2.4 更新 `edit` 输出文本中的 stale anchor 警告，引用 invalidation scope 的具体行号范围

## 3. read_file / hashline-read 增强

- [x] 3.1 在 `read_file(hashes: true)` 的 details 中添加 `anchor_format_version: "v2"` 字段
- [x] 3.2 确认 `computeLineHash` 已使用 content-only 算法（`MD5(line.trim())`）——当前已实现，添加注释说明此为 v2 语义
- [x] 3.3 更新 `formatHashedLine` 和相关注释，明确行号为 advisory snapshot position

## 4. write_file / overwrite_file 版本化闭环

- [x] 4.1 将 `overwrite_file` 的 `expected_file_version` 参数从 `Type.Optional(Type.String(...))` 改为 `Type.String(...)`（强制要求）——已是 `Type.String`，无需修改
- [x] 4.2 更新 `write_file` tool description，强调已有文件应优先使用 `edit`，整文件重写为显式高风险操作
- [x] 4.3 验证 `write_file` 成功返回时已包含 `file_version` 和 anchors preview——当前已实现，确认无误

## 5. 错误分类细化

- [x] 5.1 统一 `edit` 工具的错误码：hash 不在当前文件中返回 `anchor_stale`（当前已有），hash 从未存在过返回 `anchor_not_found`
- [x] 5.2 `write_file`/`overwrite_file` 版本不匹配时返回 `file_version_mismatch`（或复用现有 `write_conflict`，统一为 `write_conflict`）
- [x] 5.3 Range 操作逆序时返回 `invalid_range_order`（替换当前通用 `Error` throw）
- [x] 5.4 所有可恢复错误返回中添加 `suggested_action` 字段
- [x] 5.5 确认 `not_found`、`empty_operations`、`schema_invalid` 等错误码按 taxonomy 定义保持或更新

## 6. Batch Snapshot Semantics 文档化

- [x] 6.1 更新 `edit` tool description，明确声明 batch 内所有操作基于同一初始文件快照（snapshot semantics），后一个 op 不会自动基于前一个 op 的结果执行
- [x] 6.2 在 `read_file` tool description 中补充 anchor 语义：行号 advisory，hash 是 content-based identity

## 7. 测试与验证

- [x] 7.1 编写 `occurrence` 消歧功能的单元测试（单次匹配、多候选 + occurrence、多候选无 occurrence 报错、occurrence 越界）
- [x] 7.2 编写 range 操作歧义拒绝的单元测试（start 歧义、end 歧义、两端都歧义、唯一匹配成功）
- [x] 7.3 编写 invalidation contract 的单元测试（文件中间编辑、顶部编辑、末尾编辑对应的有效范围）
- [x] 7.4 编写 `anchor_format_version` 字段的单元测试
- [x] 7.5 编写错误码 taxonomy 的单元测试（各类错误码和 suggested_action）
- [x] 7.6 更新现有 edit-tool 和 hashline-read 测试用例以适配新行为（尤其是 range 操作的歧义拒绝）
