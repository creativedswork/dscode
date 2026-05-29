## Why

当前 `edit` 工具的一级故障模式已从 "stale state" 转移到 "同一快照内的 anchor ambiguity"。即使模型拿到了 fresh hashes，低熵行（`},`、`{`、空行、重复样板语句）的 4 位短 hash 仍然无法唯一定位，导致编辑被拒绝。这不是偶发问题，而是 hashline 协议在当前信息量配置下的系统性缺陷。修复它不需要推翻 hashline 方向，需要的是把 anchor 从"固定短标签"升级为"可渐进收紧的定位证据"。

## What Changes

- **低熵行过滤**：`{`、`}`、`},`、空行等低信息量行不再能作为裸主锚点进入 single-line edit 操作；range 操作中仅允许作为辅助边界
- **Hash 长度翻倍**：display hash 从 4 位 hex 升级到 6 位，resolution hash 内部保留 8–16 位前缀，必要时自适应扩展
- **Adaptive hash length**：当 4/6 位 hash 产生歧义时，edit 工具内部自动扩展 hash 长度重试，而非直接失败
- **read_file 输出锚点质量标注**：每行标注 `[low]`/`[medium]`/`[high]` 区分度等级，并在 details 中返回 `recommended_anchors`
- **Context-augmented identity**：computeLineHash 的输入从单行扩展为 `prev_nonempty + current + next_nonempty`，降低重复行的 hash 碰撞
- **错误响应增强**：区分 `anchor_prefix_ambiguous` / `anchor_context_ambiguous` / `anchor_stale` / `file_version_mismatch`，ambiguous 时返回候选行预览
- **Resolution ladder**：歧义时不直接失败，改为渐进式降级：短 hash → 长 hash → 加局部上下文 → 双锚点 → local refresh → full reread
- **anchor_format_version bump**：协议版本从 v2 升级到 v3，read 输出新增 `[quality]` 标注格式

## Capabilities

### New Capabilities
- `anchor-entropy-filter`: 低熵行检测、标记与过滤，确保只有信息量足够的行能作为主锚点
- `progressive-resolution`: 渐进式锚点解析阶梯，从短 hash 到 full reread 的逐级降级恢复

### Modified Capabilities
- `edit-tool`: 锚点解析从单次匹配升级为 adaptive + context-augmented；低熵行裸锚定被禁止；range 操作支持双锚点 + shared_context
- `hashline-read`: 输出格式新增 `[quality]` 标注和 `recommended_anchors`；hash 长度从 4 位升 6 位
- `disambiguation-protocol`: occurrence 消歧之外新增 resolution ladder 作为第二消歧路径
- `error-taxonomy`: 新增 `anchor_prefix_ambiguous`、`anchor_context_ambiguous`、`file_version_mismatch` 错误类型，细化 `suggested_action`

## Impact

- `src/drivers/edit.ts` — computeLineHash、hashLines、validateOperations、edit tool execute 全链路修改
- `src/drivers/fs.ts` — readFileTool 输出格式升级，新增 recommended_anchors 计算
- `ANCHOR_FORMAT_VERSION` 从 `"v2"` 升级到 `"v3"`
- 现有依赖 hash 格式的测试和工具（overwrite_file、write_file 的 anchors preview）需同步更新
