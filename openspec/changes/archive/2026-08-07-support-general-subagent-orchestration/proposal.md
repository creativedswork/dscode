## Why

dscode 已能加载和运行 Agent.md，但 Main Agent 无法可靠看到当前 Registry 中有哪些
Application，并且缺少可在没有专业 Agent.md 时承接动态角色的通用 Application。这使只描述
任务分工的可移植 Skill 无法稳定使用现有 SubAgent 框架。

## What Changes

- 新增内置 `general` Agent.md，作为 fresh transcript 的通用 SubAgent Application。
- 将 Registry 当前可用的 Application 名称与描述暴露给 Main Agent，使其能够优先选择匹配的
  专业 Agent.md，并在缺失时回退 `general`。
- 保持所有 Application 经过同一 Registry、Supervisor 和 RuntimeFactory 执行链。
- 增加基于真实多角色 Skill 契约的框架验收覆盖，但不将角色、任务图或文件产物写入 Harness。
- 根据真实 Skill 运行轨迹，补齐模型调用 `spawn_agent` 时对项目内本地图片 file attachment
  的安全解析、缓存和无效 image_ref 诊断。
- 明确 `fork` 不属于本次 change；它仍是后续运行时合成会话的独立能力。

## Capabilities

### New Capabilities
- `general-subagent-application`: 内置通用 Application 的定义、继承边界和 fresh transcript 启动语义。

### Modified Capabilities
- `agent-definition`: Registry 应向 Agent 调用面暴露已发现 Application 的名称与描述。
- `agent-tool`: `spawn_agent` 应展示当前可选 Application，使 Main 能按名称选择专业 Agent 或
  `general`，并应安全解析项目内本地图片 attachment。
- `package-resource`: 发布包必须包含并校验内置 `general` Agent.md。

## Impact

- 影响 Agent Application resources、Registry/Supervisor 查询接口、`spawn_agent` 工具描述、
  Agent.md 文档和 SubAgent 专项测试。
- 不新增 Runtime 类型、业务角色类型、Skill 专用工具或外部依赖。
- 作为验收场景的 `xiaohongshu-visual-post` Skill 位于独立 Skill 仓库，其角色编排仍完全由
  Skill 自身负责。
