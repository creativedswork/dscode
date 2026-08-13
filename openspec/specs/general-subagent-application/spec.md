# general-subagent-application Specification

## Purpose
TBD - created by archiving change support-general-subagent-orchestration. Update Purpose after archive.
## Requirements
### Requirement: 内置 general Application

系统 SHALL 通过 bundled `general.md` 提供通用 SubAgent Application。`general` MUST 使用与
其他 Agent.md 相同的 Registry、编译器、Application snapshot、Supervisor 和 RuntimeFactory，
系统 MUST NOT 为其创建专用 Runtime 类型。

#### Scenario: 缺少专业 Agent 时启动 general
- **WHEN** Skill 需要执行一个独立角色任务且 Registry 中没有职责匹配的专业 Agent.md
- **THEN** Main Agent 能启动 `general` 并通过本次任务 prompt 定义角色、输入、输出和约束

#### Scenario: 项目覆盖 general
- **WHEN** 项目级 `.dscode/agents/general.md` 提供合法覆盖
- **THEN** Registry 按标准来源优先级编译覆盖，后续 `general` Process 使用新的不可变 snapshot

### Requirement: general 继承运行能力边界

bundled `general` SHALL 请求继承当前模型和父 Process 允许的 Tool capability。最终 capability
MUST 继续与父 allowlist、Application denylist、permission mode、attachment 和隔离策略求交，
并 MUST 默认禁止递归 `spawn_agent`。

#### Scenario: 继承父进程工具
- **WHEN** Main Agent 允许 read、write、browser 和 MCP Tool，并以前台模式启动 `general`
- **THEN** `general` 获得经权限与 deny 规则过滤后的这些 Tool，而不会获得父进程没有的 Tool

#### Scenario: 后台写能力被限制
- **WHEN** `general` 作为 background Process 启动且没有 worktree 隔离
- **THEN** 系统按通用 attachment 规则移除写文件和 Shell capability

### Requirement: general 使用 fresh transcript

每次启动 `general` SHALL 创建全新 Runtime 和 transcript。系统 MUST NOT 将父 transcript 或
Main 专属 system prompt 复制到 `general`；父 Agent SHALL 通过任务 prompt、文件路径、
attachment 或 selected context 显式提供所需输入。

#### Scenario: 并行启动两个动态角色
- **WHEN** Main Agent 同时使用 `general` 启动两个相互独立的逻辑角色
- **THEN** 系统创建不同 agentId、不同 Runtime 和不同 transcript，两个 Process 只接收各自任务

#### Scenario: 独立 Reviewer
- **WHEN** Skill 在创作 Process 退出后再次启动 `general` 执行 Reviewer 任务
- **THEN** Reviewer 不包含创作 Process 的 transcript，只能读取委托 prompt 指定的最终产物

