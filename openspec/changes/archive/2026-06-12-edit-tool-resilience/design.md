## Context

dscode 的 edit 工具基于 content-addressable hash anchor 协议实现文件编辑。当前生产环境中 edit 成功率为 69.2%，失败模式集中在四个领域：参数命名冲突、anchor 失效感知缺失、边界条件拒绝、错误诊断信息不足。每会话平均浪费 ~15% token 和 ~20% 往返延迟。

技术方案覆盖三个架构层：系统层（S1-S3，工具间协议一致性）、工具层（T1-T4，单工具智能增强）、模型层（M1-M2，prompt 工程预防）。

## Goals / Non-Goals

**Goals:**
- 将 edit 成功率从 69.2% 提升至 Phase 1 ≥85%、Phase 2 ≥92%、Phase 3 ≥96%
- 消除系统性失败模式：参数错误、anchor_stale、invalid_range_order
- 提供精确诊断信息，将失败恢复往返从平均 2.0 轮降至 1.0 轮
- 保持向后兼容，所有变更不破坏现有集成

**Non-Goals:**
- 不改变 hash 算法或 anchor 协议版本（保持 v3）
- 不引入新的工具类型（仅增强现有工具）
- 不修改 checkpoint/safety 的核心安全语义（strict 模式保持不变）
- 不处理模型幻觉导致的非系统性失败

## Decisions

### D1: 参数统一使用 `path` 而非 `file_path`

**选择**: 所有文件工具统一使用 `path` 作为文件路径参数名。

**理由**: 工具集内 write_file/overwrite_file/read_file 已使用 `path`，仅 edit 使用 `file_path`。变更面最小（1 个工具），与文件系统直觉一致。

**备选方案**: (a) 全部改为 `file_path` — 变更面更大（4 个工具）；(b) 同时接受两个名称 — 增加模型歧义。

**过渡策略**: 保留 `file_path` 别名 4 周，transform 层自动映射并输出 deprecation warning。4 周后移除别名。

### D2: anchor 失效通过返回增强 + Conversation 层注入双层机制

**选择**: write_file/overwrite_file 返回 `anchors_invalidated: true` + `preview_anchors`，同时通过 session context store 在下一轮 conversation 中注入失效提醒（作为 user turn 前缀消息，**不修改 system prompt**）。

**理由**: 单一返回增强无法保证模型注意到（模型可能在长上下文中忽略 tool result 细节）；单一 conversation 注入则依赖 session 状态追踪。双层机制互补。**注入位置选择 conversation 层而非 system prompt 的关键原因：保护 LLM API 的 prompt prefix caching。** system prompt 是对话中最稳定的前缀，若每轮动态修改 system prompt，会导致缓存完全失效，每轮额外浪费 2000-5000 tokens 的传输和计费。conversation 层（user turn）本身每轮都在变化，注入到这里不会影响缓存边界。

**备选方案**: (a) 仅返回增强 — 模型可能忽略；(b) 注入到 system prompt — 破坏 prompt caching，否决；(c) 注入到独立 system-role conversation message — 可行但增加 message 复杂度，user turn 前缀更简洁。

### D3: replace_range 自动纠正而非拒绝

**选择**: 当 start_line > end_line 时自动交换端点并标记 `auto_corrections`。

**理由**: 分析报告显示 invalid_range_order 完全由模型颠倒 hash 顺序导致，语义意图明确（替换从 A 到 B 的区域），自动纠正比拒绝+重试更高效。

**边界保护**: 相同行（no-op）不纠正，直接拒绝；hash 解析失败不纠正，先返回解析错误。

### D4: 跨版本恢复采用三级渐进策略

**选择**: Level 1（fv 匹配→直接执行）→ Level 2（fv 不匹配但 hash 全存在→执行+warning）→ Level 3（hash 缺失→精确诊断+suggestions）。

**理由**: Level 2 在不引入数据损坏风险的前提下（所有 hash 存在且唯一），将部分 anchor_stale 场景从"拒绝+1 往返"降级为"执行+0 往返"。Level 3 通过 nearby line 候选加速定位。

**安全边界**: Level 2 要求 ALL hashes 全部存在且唯一，任一 hash 缺失或 ambiguous 即降级到 Level 3。

### D5: safety_check 扩展为多维度分操作诊断

**选择**: 按 operation 报告 braces/parentheses/brackets/html-tags 平衡 delta，输出结构化诊断表格。

**理由**: 当前仅报告 net 不平衡且不指出具体操作，模型需要额外往返定位。分操作 delta + 行号直接定位可将恢复往返从 2-3 轮降至 1 轮。

**safety_check 三级模式**: strict（默认，保持现有行为）、warn（执行但标记 warning）、off（跳过检查）。warn/off 仅限 system prompt 中明确列举的可用场景。

### D6: 重叠操作自动合并而非全部拒绝

**选择**: 安全组合（replace+insert 同 hash）自动合并；语义矛盾组合（replace+delete）保留拒绝+精确提示。

**理由**: replace+insert 组合的意图明确（替换某行并在其后插入），合并为一个 replace_line 不改变语义。拒绝会强制模型拆分两次调用，增加往返。

**不可合并**: replace+delete（矛盾）、insert_after+insert_before（顺序歧义）。

## Risks / Trade-offs

| 风险 | 概率 | 缓解 |
|------|------|------|
| `file_path`→`path` 迁移破坏现有 API 调用方 | 低 | 4 周过渡期 alias + telemetry 监控 `file_path` 使用量 |
| auto-swap 纠正模型故意颠倒的语义 | 极低 | 返回中标记 `auto_corrections`，模型可检测并自纠正 |
| Level 2 跨版本恢复导致数据损坏 | 低 | 仅当所有 hash 存在且唯一时启用，任一异常即降级 |
| safety_check `warn` 模式被模型滥用 | 中 | 默认 strict，system prompt 明确限制 warn 场景 |
| session context store 引入内存泄漏 | 低 | TTL 机制（anchor 失效事件在下一轮消耗后自动清除） |
| S2b conversation 注入导致 prompt cache 边界偏移 | 中 | 注入到 user turn 前缀（非 system prompt），system prompt 保持完全静态以保护前缀缓存 |

## Migration Plan

### Phase 1 (Week 1-2): 快速止血
- S1: `file_path` → `path` + alias
- S2a: write_file 返回增强
- T1: range 自动纠正
- M1: system prompt 补充
- **回滚**: 每个变更独立 feature flag，通过配置开关控制

### Phase 2 (Week 3-4): 深度巩固
- S2b: conversation 层锚点失效注入
- S3: recommended_anchors 增强
- T3: safety_check 扩展
- T4: overlap 自动合并

### Phase 3 (Week 5-6): 智能优化
- T2: 跨版本恢复
- M2: 重写成本提示
- 回归测试 + 成功率监控

### 回滚策略
- 每个方案项独立可回滚（feature flag 或配置开关）
- 成功率指标实时监控，异常自动告警
- alias 过渡期结束后平滑移除

## Open Questions

1. **session context store 的具体实现路径**: 复用现有 session management 基础设施还是新建独立 store？
2. **preview_anchors 数量**: 前 10 行是否足够？是否需要根据文件大小动态调整？
3. **M1 system prompt 追加位置**: 追加到 tool use section 还是独立的 edit guidelines section？
4. **成功率监控粒度**: 按错误类型分维度监控还是仅追踪总体成功率？
5. **prompt caching 边界验证**: 注入到 user turn 前缀是否在 `@mariozechner/pi-ai` 框架中确实不影响 prompt cache？需要实测确认缓存命中率。
