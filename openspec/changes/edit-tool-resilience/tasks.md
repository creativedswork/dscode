## 1. Phase 1 — 快速止血 (S1, S2a, T1, M1)

### 1.1 S1: 统一参数命名 file_path → path

- [x] 1.1.1 修改 `src/tools/edit.ts` 的 Zod schema：`file_path` → `path`（主参数），新增 `file_path` 为 optional deprecated alias
- [x] 1.1.2 实现 `.transform()` 层：`file_path` 自动映射到 `path`，输出 deprecation warning 到 stderr
- [x] 1.1.3 修改实现函数中所有 `params.file_path` 引用 → `params.path`
- [x] 1.1.4 添加单元测试：`path` 正常使用、`file_path` 带 warning 兼容、两者同时提供时 `path` 优先、缺参数验证失败
- [x] 1.1.5 更新 `edit-tool` spec 中其他 requirement 的示例代码（如有引用 `file_path`）

### 1.2 S2a: write_file/overwrite_file 返回锚点失效信号

- [x] 1.2.1 扩展 `WriteFileResult` 类型：新增 `anchors_invalidated: true`、`hint: string`、`preview_anchors` 字段
- [x] 1.2.2 在 `write_file` 执行成功后，计算前 30 行的 hash，筛选 quality=`high` 的行（最多 10 条），填充 `preview_anchors`
- [x] 1.2.3 在 `overwrite_file` 中复用相同逻辑
- [x] 1.2.4 添加单元测试：100 行文件返回 8 个 high anchors、5 行文件仅 1 个 high anchor、空文件返回空数组
- [x] 1.2.5 验证 `hint` 字段中包含 `read_file({ hashes: true })` 的明确指引

### 1.3 T1: replace_range 方向自动纠正

- [x] 1.3.1 在 `resolveRange()` 函数中添加 `startLine > endLine` 检测
- [x] 1.3.2 实现自动 swap：交换 start 和 end 端点，设置 `corrected = true`
- [x] 1.3.3 在操作结果中填充 `auto_corrections` 数组，包含 `type: "range_order_swapped"` 和详细说明
- [x] 1.3.4 边界保护：同 hash（同一行）不纠正直接拒绝；hash 解析失败不纠正先返回错误
- [x] 1.3.5 添加单元测试：start=800/end=20 自动 swap、正常顺序不触发、同 line no-op 拒绝、缺失 hash 不触发 swap

### 1.4 M1: System Prompt 补充 edit best practices

- [x] 1.4.1 在 system prompt 的 tool use section 新增 "Edit Tool Best Practices" 子章节
- [x] 1.4.2 内容覆盖：anchor 选择规范（prefer recommended_anchors, 禁用 [low] 作 range 端点）、post-rewrite 刷新、range 操作顺序、safety_check 诊断、overlap 拆分
- [x] 1.4.3 验证 prompt 中包含 `anchor_stale`、`invalid_range_order`、`safety_check_failed`、`overlapping_operations` 等关键错误类型的预防指引

## 2. Phase 2 — 深度巩固 (S2b, S3, T3, T4)

### 2.1 S2b: Session context 锚点失效注入

- [x] 2.1.1 设计 session context store：`Map<filePath, AnchorInvalidationEvent>`，含 TTL（下一轮消费后清除）
- [x] 2.1.2 在 `write_file`/`overwrite_file` 完成时写入 invalidation event（file_path, new_line_count, file_version）
- [x] 2.1.3 在下一轮 model turn 开始时检查 store，若有 pending events 则注入到 conversation user turn 前缀（**不修改 system prompt**）
- [x] 2.1.4 注入后清除已消费事件（防止重复注入）
- [x] 2.1.5 添加单元测试：write_file 后下一轮 user turn 含 notice、仅 edit 不触发、多文件并行无效化、event 只注入一次、system prompt 保持不变

### 2.2 S3: recommended_anchors 权重增强

- [x] 2.2.1 修改 `read_file` 输出格式：`low` quality 行追加 `occurrences=N` 和 `WARNING:ambiguous_anchor` 标记
- [x] 2.2.2 确保 `recommended_anchors` 列表中排除所有 `low` quality anchor
- [x] 2.2.3 在 read_file 返回末尾增加 "RECOMMENDED ANCHORS" 视觉分隔区块，格式 `line N hash XXXXXX quality [high] N repeats`
- [x] 2.2.4 添加单元测试：`}` 行显示 occurrences 和 warning、high 行无 warning、recommended_anchors 不含 low、推荐锚点展示格式正确

### 2.3 T3: Safety check 扩展 + 精确诊断

- [x] 2.3.1 扩展 `SafetyCheckResult` 类型：新增 `checks: { braces, parentheses, brackets, html_tags }` 结构
- [x] 2.3.2 实现 per-operation delta 计算：每个操作单独统计 brace/paren/bracket/html-tag 的前后变化
- [x] 2.3.3 实现结构化错误消息：按 operation 分组的诊断表格，含 op_index、hash、line、各维度 delta
- [x] 2.3.4 新增 `safety_check` 参数：`"strict"` (默认), `"warn"`, `"off"`
- [x] 2.3.5 strict 模式行为不变（失败回滚）；warn 模式执行但返回 `safety_warnings`；off 模式跳过检查
- [x] 2.3.6 添加单元测试：单 op brace 不平衡、多 op 累积不平衡、HTML 标签不闭合、warn 模式执行+warning、off 模式跳过、strict 默认行为

### 2.4 T4: Overlapping operations 自动合并

- [x] 2.4.1 实现 `detectAndResolveOverlaps()` 函数：检测同一 hash 被多次引用
- [x] 2.4.2 实现安全组合自动合并：`replace_line` + `insert_after` → 合并 replace 内容；`insert_before` + `replace_line` → 合并 replace 内容
- [x] 2.4.3 不可合并组合保留拒绝 + 精细错误提示：`replace`+`delete` (semantic conflict)、`insert_after`+`insert_before` (order ambiguous)
- [x] 2.4.4 合并后的 response 中包含 warning 说明合并行为
- [x] 2.4.5 添加单元测试：replace+insert_after 合并、insert_before+replace 合并、replace+delete 拒绝、insert_after+insert_before 拒绝

## 3. Phase 3 — 智能优化 (T2, M2, 测试监控)

### 3.1 T2: Cross-version best-effort recovery

- [x] 3.1.1 实现 Level 1（当前行为）：`expected_file_version` 匹配 → 直接执行
- [x] 3.1.2 实现 Level 2：fv 不匹配时提取所有操作 hash，在当前文件中检查是否全部存在且唯一
- [x] 3.1.3 全部存在且唯一 → 执行所有操作，response 标记 `warning: "cross_version"`
- [x] 3.1.4 实现 Level 3：hash 缺失时，返回 `missing_hashes` + `suggested_nearby`（基于原快照行号映射到当前文件附近的 3 行）
- [x] 3.1.5 安全边界：任一 hash 缺失或 ambiguous → 全部拒绝（不部分执行）
- [x] 3.1.6 添加单元测试：fv 匹配正常执行、fv 不匹配+hash 全有效 warning 执行、fv 不匹配+hash 缺失返回诊断、hash ambiguous 拒绝

### 3.2 M2: 全量重写成本提示

- [x] 3.2.1 在 tool selection 阶段（write_file/overwrite_file 被选择时）添加 pre-call hook
- [x] 3.2.2 触发条件检查：文件存在、> 30 行、变更估计 < 50 行
- [x] 3.2.3 注入 soft reminder context：文件行数、建议使用 edit、全量重写成本（~2s 延迟、~500-2000 tokens）
- [x] 3.2.4 不触发场景验证：新文件、大变更（>200 行）、文件不存在时不注入
- [x] 3.2.5 添加单元测试：200 行文件小改动注入提醒、新文件不注入、大改动不注入、提醒内容含文件行数和时间戳

### 3.3 回归测试 + 成功率监控

- [x] 3.3.1 编写集成测试覆盖 edit 全流程：read(hashes)→edit(success)→verify file content
- [x] 3.3.2 编写失败场景回归测试：anchor_stale、invalid_range_order、safety_check_failed、overlapping_operations
- [x] 3.3.3 实现 edit 成功率 metrics 埋点：按错误类型分维度统计（anchor_stale、safety_check_failed、ambiguous_anchor 等）
- [x] 3.3.4 设置成功率 baseline（69.2%）和告警阈值（< 85% 告警）
- [x] 3.3.5 运行 `npm test` 确认所有新增测试通过
- [x] 3.3.6 运行 `npm run typecheck` 确认无类型错误
