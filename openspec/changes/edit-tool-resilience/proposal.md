## Why

Edit tool 在生产环境中的成功率为 69.2%，系统性失败模式（参数命名冲突、anchor_stale、invalid_range_order、safety_check_failed 诊断不足）导致每会话平均浪费 ~15% token 和 ~20% 往返延迟。基于 `docs/EDIT-TOOL-FAILURE-ANALYSIS.md` 的根因分析，需要通过系统层、工具层、模型层的综合治理将成功率提升至 ≥ 90%。

## What Changes

- **S1 — 统一文件工具参数命名**：edit 工具 `file_path` → `path`，消除跨工具命名不一致导致的 API 调用失败。保留 `file_path` 别名过渡 4 周。**BREAKING**（过渡期后移除别名）。
- **S2 — write_file/overwrite_file 后锚点提醒**：全量重写后注入 `anchors_invalidated` 信号 + 下一轮 system prompt 携带锚点失效上下文，消除 anchor_stale 失败。
- **S3 — recommended_anchors 权重增强**：低质量 anchor 显式标记 occurrences + warning，强化推荐锚点的视觉权重。
- **T1 — replace_range 方向自动纠正**：检测 start/end 颠倒时自动交换并标记 correction，消除 invalid_range_order。
- **T2 — edit 跨版本尽力恢复**：三级恢复策略：fv 匹配→直接执行；fv 不匹配但 hash 全部存在→尽力执行+warning；hash 缺失→精确诊断+邻近候选。
- **T3 — safety_check 扩展 + 精确诊断**：按操作报告括号/标签平衡、指出具体行号；新增 `safety_check` 参数（strict/warn/off）。
- **T4 — overlapping_operations 自动合并**：检测 replace+insert 同 hash 引用时自动合并为单一操作。
- **M1 — 模型 system prompt 补充**：在 tool use system prompt 中注入 edit tool best practices（anchor 选择、全量重写后刷新、range 规范等）。
- **M2 — 全量重写成本提示**：当模型对 >30 行文件选择 write_file 时注入 soft reminder，引导优先使用 edit。

## Capabilities

### New Capabilities

- `anchor-lifecycle-signals`: write_file/overwrite_file 返回锚点失效信号 + session-level 上下文注入机制，确保模型在全量重写后感知旧 anchor 失效
- `edit-diagnostic-enhancement`: 扩展 safety_check 为按操作诊断（braces/parentheses/brackets/html-tags），支持 strict/warn/off 三级模式；重叠操作检测与自动合并（replace+insert 同 hash）
- `model-edit-guidance`: system prompt 中注入 edit tool 最佳实践（anchor 选择规范、全量重写后刷新、range 操作注意事项）+ 大文件全量重写成本 soft reminder

### Modified Capabilities

- `edit-tool`: S1 参数命名 `file_path` → `path`（含过渡期 alias）；T1 replace_range 方向自动纠正；T2 跨版本三级恢复策略
- `hashline-read`: S3 返回结构扩展 — LineAnchor 增加 `occurrences` 和 `warning` 字段；recommended_anchors 展示增强

## Impact

- **核心工具**: `src/tools/edit.ts`, `src/tools/write_file.ts`, `src/tools/read_file.ts`
- **上下文系统**: session context store（S2b 锚点失效事件注入）
- **System Prompt**: tool use instructions 追加 edit best practices + 成本提示
- **类型定义**: `src/types/anchor.ts` — LineAnchor、SafetyCheckResult 扩展
- **依赖 spec**: `edit-tool`, `hashline-read`, `invalidation-contract`, `file-write-tracker`, `checkpoint-manager`
