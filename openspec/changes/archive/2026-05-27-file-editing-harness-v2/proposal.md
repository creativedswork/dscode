## Why

`dscode` 的文件编辑工具已具备 hash-based anchor 基础，但协议层面仍存在多个 safety gap：range-addressing 缺乏 preimage 校验容易导致 catastrophic over-delete；重复内容行缺乏结构化的歧义处理机制；edit 成功后缺少显式的 invalidation contract；错误分类偏粗不利故障归因；`write_file`/`overwrite_file` 缺少统一的 file-level version 保护。这些 gap 的核心问题是：**协议还没有从 "尽量命中" 演进为 "绝不静默错改"**。需要将文件编辑协议升级为以安全失败、显式失效、连续可衔接为中心的 harness。

## What Changes

- **Anchor 语义显式化与 range-addressing 收紧**：`delete_range` / `replace_range` 引入 preimage 校验，range 操作命中多候选时必须报 `anchor_ambiguous` 而非静默使用第一个匹配。统一描述的 anchor 语义：行号 advisory，hash 是 guard material。
- **歧义消解协议（Disambiguation）**：当单个 hash 命中多个候选行时，协议必须显式返回 `anchor_ambiguous` 错误而非继续猜测。支持通过邻接上下文指纹或 occurrence ordinal 消歧。
- **`read_file` 成为统一协议入口**：`read_file(hashes: true)` 额外返回 `anchor_format_version`，明确定义当前锚点协议版本。返回结构化 `file_version` 供写操作校验。
- **Edit 后 invalidation contract**：edit 成功返回时，明确声明 `anchors_valid_through`、`must_refresh_from_line` 等失效范围，而非模糊提示 "may be stale"。
- **`write_file` / `overwrite_file` 版本化闭环**：对已有文件重写强制要求 `expected_file_version`，返回新版本与 anchors preview，提示旧锚点全面失效。
- **错误分类细化**：从粗粒度的 `not_found` / `hash_mismatch` / `apply_failed` 升级为协议语义化的错误码体系（`anchor_stale`、`anchor_ambiguous`、`anchor_format_unsupported`、`file_version_mismatch`、`write_conflict`、`invalid_range_order` 等），并返回结构化 details。
- **Batch snapshot semantics 文档化**：在 tool description 和 schema 中明确 batch 内所有操作基于同一初始快照。
- **协议版本迁移策略**：引入 `anchor_format_version`，新旧格式不混用，hash 语义变化时强制 reread。

## Capabilities

### New Capabilities
- `disambiguation-protocol`: 歧义消解协议——当 anchor 命中多个候选时的结构化报错与上下文消歧机制
- `invalidation-contract`: Edit 后的失效契约——明确返回哪些旧锚点已失效、哪些区域必须刷新
- `error-taxonomy`: 错误分类体系——从实现级错误升级为协议语义级错误码，便于故障归因与恢复策略

### Modified Capabilities
- `edit-tool`: range 操作增加 preimage 校验与歧义保护；edit 返回增加 invalidation contract
- `hashline-read`: 增加 `anchor_format_version` 返回；结构化 `file_version` 与 `anchor_format_version` 分离

## Impact

- **Affected code**: `src/drivers/edit.ts`（edit 工具全部逻辑）、`src/drivers/fs.ts`（read_file、write_file、overwrite_file）
- **Affected specs**: `openspec/specs/edit-tool/spec.md`、`openspec/specs/hashline-read/spec.md`
- **Breaking changes**: `delete_range` / `replace_range` 现在在命中重复内容时会报 `anchor_ambiguous`（之前静默用第一个匹配）；`overwrite_file` 的 `expected_file_version` 从可选改为强制；anchor 格式变更需要 `anchor_format_version`
- **Migration**: 需要 `anchor_format_version` 字段协调新旧协议；旧 session 中的 anchors 可能因 hash 语义不变（已为 content-only）而仍可用，但 range 操作的歧义策略变化可能导致旧批处理在新协议下被拒绝
