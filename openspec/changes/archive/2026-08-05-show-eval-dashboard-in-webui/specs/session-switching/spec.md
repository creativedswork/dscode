## MODIFIED Requirements

### Requirement: 切换前目标预检

系统 MUST 在中止当前 turn 或修改当前 Session 前解析唯一目标，并完成目标 Session
的读取、格式校验和资源恢复。目标候选集合 MUST 合并当前项目 Session 索引、
受限全局 Session 索引和当前 Session metadata，并按完整 Session ID 去重。当前项目
中存在的 Session 即使已被全局索引容量淘汰，也 MUST 保持可解析。

#### Scenario: 目标不存在
- **WHEN** 用户加载不存在的 Session ID
- **THEN** 系统返回 Session not found，且当前 turn、Session 和 Main Process 归属均不改变

#### Scenario: 前缀不唯一
- **WHEN** Session ID 前缀匹配多个 Session
- **THEN** 系统返回候选冲突，且不执行 abort 或 save

#### Scenario: 项目 Session 已从全局索引淘汰
- **WHEN** 目标 Session 仍存在于当前项目索引，但不再存在于受限全局索引
- **THEN** 统一 Session 切换入口 SHALL 从项目索引解析该目标
- **AND** SHALL 按正常事务顺序完成预加载、保存、重绑定和提交

#### Scenario: 相同 Session 同时存在于多个索引
- **WHEN** 同一完整 Session ID 同时出现在项目索引、全局索引或当前 Session metadata
- **THEN** 目标预检 SHALL 将其视为一个候选
- **AND** SHALL NOT 因重复索引记录报告前缀冲突
