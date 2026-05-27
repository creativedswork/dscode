## Context

当前 `dscode` 的文件编辑层已实现：
- **hashline-read**：`read_file(hashes: true)` 产出 `lineNumber#hash|content` 格式的行级锚点，以及 file-level `file_version`（SHA256 前 8 位）
- **edit**：支持 6 种操作（replace_line、replace_range、insert_after、insert_before、delete_line、delete_range），全量 hash 预校验 + 原子批处理拒绝，成功时返回 local diff + `file_version`
- **write_file / overwrite_file**：write_file 支持 optional `expected_file_version`，overwrite_file 强制要求，写后返回新 anchors preview

核心 gap 在于协议语义尚未完成 safety-first 的转型：
1. Range 操作在两个 anchor 命中多个候选时，当前实现取第一个匹配（`lineNums[0]`）——这是危险的静默猜测
2. 重复内容行（如 `}`、空行）的 hash 冲突没有结构化消歧机制
3. Edit 成功后只说 "anchors outside the displayed diff may be stale"，没有精确的 invalidation scope
4. 错误码体系停留在实现层（`hash_mismatch`、`apply_failed`），缺少协议语义级分类
5. `anchor_format_version` 在协议中缺席，无法在 hash 语义升级时安全切换

改进建议清单 2.0 定义了三个阶段：先补安全边界 → 补连续编辑闭环 → 补系统化观测。本设计覆盖前两个阶段的核心实现。

## Goals / Non-Goals

**Goals:**
- 收紧 range-addressing：`delete_range` / `replace_range` 在两个端点 hash 命中多个候选时，必须报 `anchor_ambiguous` 错误而非静默取第一个匹配
- 引入歧义消解协议：单行操作（replace_line、insert_after、insert_before、delete_line）在命中多个候选项时报 `anchor_ambiguous`，并支持 occurrence ordinal 消歧
- `read_file(hashes: true)` 返回 `anchor_format_version` 字段
- Edit 成功后返回精确的 invalidation contract（`anchors_valid_through`、`must_refresh_from_line`）
- 细化错误分类：`anchor_stale`、`anchor_ambiguous`、`anchor_format_unsupported`、`file_version_mismatch`、`write_conflict`、`invalid_range_order`、`schema_invalid`
- `overwrite_file` 的 `expected_file_version` 从 optional 改为 required

**Non-Goals:**
- 不引入邻接上下文指纹或 block fingerprint 作为新的消歧锚点格式（2.0 协议建议但实现复杂度高，可在后续迭代中引入）
- 不实现 Benchmark / telemetry dashboard（第三阶段，需要独立的基础设施）
- 不改变 hash 计算算法（MD5 前 4 位保持不变）
- 不引入 `replace_exact` / `replace_span` / `replace_block` 替代原语（保持现有 6 种操作，通过收紧 constraints 增强安全性）

## Decisions

### D1: Range 操作歧义策略：多候选一律报错
**选择**：`delete_range` / `replace_range` 的 start_hash 或 end_hash 命中多个候选行时，拒绝整个 batch 并返回 `anchor_ambiguous` 错误。

**备选方案**：
- *方案 B*：取第一个候选，但增加 "就近" 策略（选离另一端最近的那个）。风险：仍然是对歧义的静默编译，可能导致边界错位。
- *方案 C*：要求 range 操作附带 preimage 文本校验。更安全但大幅增加 agent 的实现负担。

**理由**：安全失败原则。range 操作的歧义风险高（两个端点同时歧义的概率乘积），宁可拒绝并引导 agent 用更精确的 anchor 或全量 reread。

### D2: 单行操作歧义策略：报错 + occurrence ordinal
**选择**：单行操作（replace_line、insert_after、insert_before、delete_line）的 hash 命中多候选时，如果调用方在操作中提供了 `occurrence` 字段（1-indexed），则使用第 N 次出现的该内容行；否则报 `anchor_ambiguous` 错误，并在错误 details 中返回所有候选行号。

**备选方案**：
- *方案 B*：永远取第一个候选。风险：静默错误，模型不知道它在改哪个 `}`。
- *方案 C*：引入 context hash（prev_hash + self_hash + next_hash）。更精确但改变锚点格式，迁移成本高。

**理由**：`occurrence` 是最小侵入的消歧机制，不改变锚点格式，agent 通过简单的 "第 N 个" 描述即可精确指定。当 occurrence 不可用时，显式报错而非猜测。

### D3: Invalidation contract 计算
**选择**：edit 执行完成后，基于操作影响的 min/max 行号计算 `anchors_valid_through`（受影响区域之前的最小行号 - 1）和 `must_refresh_from_line`（受影响区域之前的最小行号）。

**计算规则**：
- 收集所有操作的目标行号（从 hashMap 解析）
- `must_refresh_from_line = min(target_lines)`
- `anchors_valid_through = must_refresh_from_line - 1`
- 若 `anchors_valid_through < 1` 则设为 0（表示无有效锚点保留）

**理由**：精确声明比模糊提示更能支撑连续编辑闭环。agent 明确知道哪些行号范围内的锚点可以安全复用。

### D4: 错误码体系
**选择**：保持现有的 `"anchor_stale"` 作为 hash 不匹配的统一错误码，但在 details 中新增语义化 `error_code` 字段：
- `anchor_stale`：hash 在当前文件中不存在（可能是 stale 或从未存在）
- `anchor_ambiguous`：hash 命中多个候选行，无法唯一确定目标
- `anchor_format_unsupported`：调用方使用的锚点格式版本不被支持
- `file_version_mismatch`：write_file/overwrite_file 的 `expected_file_version` 与当前文件不匹配
- `write_conflict`：文件在读写之间被外部修改
- `invalid_range_order`：start_hash 行号 > end_hash 行号
- `schema_invalid`：操作参数不符合 schema

**理由**：错误码是协议与 agent 之间的核心沟通机制，细化到语义级别可以提升 agent 的自动恢复能力。

### D5: anchor_format_version
**选择**：在 `read_file(hashes: true)` 的 details 中增加 `anchor_format_version: "v2"`，表示当前实现使用的是 content-only hash（行号不参与 hash 计算）。

**理由**：为未来 hash 算法或格式升级预留安全切换路径。当版本变化时，agent 必须 reread。

## Risks / Trade-offs

- **[Risk] Range 操作的歧义拒绝率上升**：重复内容较多的文件（如大量 `}` 的嵌套结构）中，使用 `delete_range` / `replace_range` 可能会因为端点歧义而频繁被拒绝 → **Mitigation**：引导 agent 通过单行操作组合实现 range 效果；或在 range 操作中支持 `occurrence` 字段指定候选顺序
- **[Risk] occurrence 消歧对 agent 的认知负担**：agent 需要从 read_file 输出中数 "第几次出现" → **Mitigation**：在 `anchor_ambiguous` 错误中返回所有候选行号，帮助 agent 快速识别；同时保留 range 操作为 `occurrence` 不可用时的后备
- **[Trade-off] occurrence vs context-hash**：occurrence 更简单但可能在文件变更后失效（如删除了前面一个相同内容行） → 这是可接受的 trade-off，因为失效会触发 `anchor_stale` 报错而非静默写入
- **[Risk] Invalidation contract 的保守性**：`must_refresh_from_line` 基于受影响区域计算，保守地认为从该行起所有锚点都失效 → 这是 intentional 的保守设计，宁可多 refresh 也不要留下隐式 stale anchor
