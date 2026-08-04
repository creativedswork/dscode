# Agent Applications

dscode 将 Agent 配置视为可启动的 Application，将 Main Agent 和 SubAgent
视为运行中的进程。Application 使用带 YAML frontmatter 的 Markdown 文件定义。

## 目录与优先级

同名 Application 按以下顺序覆盖：

```text
resources/agents
< ~/.claude/agents
< ~/.dscode/agents
< <project>/.claude/agents
< <project>/.dscode/agents
< managed policy directory
```

所有 Application 都由通用 `PiAgentRuntimeAdapter` 执行。`runtime` 和
`entrypoint` 不是 Agent.md 字段，配置不能选择任意内部代码入口。

当前唯一随 dscode 发布的 Agent.md 是 `vision.md`。Main Agent 保持原有
Harness 实现；general、explore、plan、reviewer 不作为内置 Application 发布。

Vision 是普通 Agent 进程。它由 AgentSupervisor 创建并拥有 agentId、PPID、
状态、事件和退出结果，和其他 SubAgent 一样通过独立 Pi Agent 模型循环执行。
`tools: []` 和 `skills: []` 使其不加载工具能力；模型失败后由 Application
声明的 OCR fallback 在同一 Agent 进程中恢复。

`vision.md` 使用 `model: vision` 作为可移植别名，默认解析到
`~/.dscode/config.json` 的 `vision.provider/model`。项目覆盖可以改为明确的
`provider/model` 或 bare model；API key 继续保存在运行配置或 provider 环境变量，
不写入 Agent.md。用户任务直接作为 Pi Agent prompt，图片作为通用 Attachment，
因此 Vision 能优先提取与任务相关的视觉证据。

## 示例

```markdown
---
name: reviewer
description: Review a change without modifying files
tools: [Read, Glob, Grep]
model: inherit
permissionMode: plan
maxTurns: 8
memory: project
---

Review correctness, regressions, security risks, and missing tests.
```

Claude Code 工具别名会转换为 dscode 工具名：

| Claude Code | dscode |
|-------------|--------|
| `Read` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `edit` |
| `Glob` | `glob` |
| `Grep` | `grep` |
| `Bash` | `bash` |
| `Agent`, `Task` | `spawn_agent` |

## 字段兼容

| 字段 | 状态 | 说明 |
|------|------|------|
| `name`, `description` | 支持 | 文件名是缺省 name |
| Markdown 正文 | 支持 | 编译为 systemPrompt |
| `tools`, `disallowedTools` | 支持 | 与父进程 capability 取交集 |
| `model` | 支持 | `inherit` 及可配置 `haiku/sonnet/opus` alias |
| `effort` | 支持 | reasoning level 或 0-1 数值 |
| `permissionMode` | 支持 | default、acceptEdits、plan；bypass 仅 managed |
| `maxTurns` | 支持 | 达到上限后终止 Agent loop |
| `skills` | 支持 | 启动时注入 Application Skill |
| `initialPrompt` | 支持 | Application 缺省输入 |
| `memory` | 支持 | user、project、local Application Memory |
| `background` | 支持 | 缺省 attachment |
| `isolation: worktree` | 支持 | Git Worktree cwd |
| `color` | 解析 | 保存在 Application snapshot，供 UI 使用 |
| `fallback` | 支持 | 仅允许注册的 Handler 和失败事件 |
| `mcpServers` | 暂不支持 | 产生结构化诊断，Application 不进入 Registry |
| `hooks` | 暂不支持 | 产生结构化诊断，Application 不进入 Registry |

未知字段、非法权限模式、内部入口字段、项目级 bypassPermissions、无效
maxTurns 以及未实现能力都会进入 `AgentApplicationRegistry` diagnostics，不会被静默忽略。

## 进程工具

Main Agent 默认获得：

```text
spawn_agent
list_agents
wait_agent
get_agent_output
terminate_agent
kill_agent
suspend_agent
continue_agent
background_agent
send_agent_message
```

`spawn_agent` 必须显式指定已在用户级、项目级或 managed 目录配置的
Application；系统不隐式提供 `general` Application。

默认最大深度为 1，SubAgent 不获得 `spawn_agent`。后台写 Agent 只有在
Application 声明 `isolation: worktree` 时才获得写工具。
`background_agent` 可将运行中的 foreground 进程 detach，Runtime 和 agentId
保持不变；没有 Worktree 的写/Shell 进程会拒绝 detach。

设置 `agents.enabled: false` 或 `DSCODE_AGENTS_ENABLED=false` 可关闭进程工具，
恢复单 Main Agent 行为。

管理员可以通过 `DSCODE_MANAGED_AGENTS_DIR` 指定只读策略目录。该目录优先级最高，
也是唯一允许声明 `permissionMode: bypassPermissions` 的外部来源。

## npm 发行资源

构建会将 `resources/agents/vision.md` 与其他运行时资源组装到
`release/package/dist/resources/`，并生成包含版本和 SHA-256 的 manifest。
生产运行时只通过 CLI 模块相对路径加载 manifest，不搜索 cwd 或 `src/`。

GitHub Actions 对 `release/package` 执行 npm pack、完整性检查和临时安装测试，
然后发布同一个已验证 tgz。
