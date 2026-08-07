# Agent.md 配置与使用

`Agent.md` 用来定义可启动的 Agent Application。dscode 将 Application 视为
可执行配置，将每次启动视为独立 Agent Process：

- Main Agent 是 PID 1；
- `Agent.md` 是 Application 描述符；
- SubAgent 是由 `AgentSupervisor` 管理的进程；
- Session 是承载对话的 TTY，不是 SubAgent Runtime。

所有 Application 都通过统一的 `PiAgentRuntimeAdapter` 执行。配置只能选择
Prompt、模型和 capability，不能指定专用 Runtime 或内部入口。

## 快速开始

在项目中创建 `.dscode/agents/reviewer.md`：

```markdown
---
name: reviewer
description: Review changes without modifying files
tools: [Read, Glob, Grep]
model: inherit
permissionMode: plan
maxTurns: 8
memory: project
---

Review correctness, regressions, security risks, and missing tests.
Return findings ordered by severity with file and line references.
```

重新启动 dscode 后，在对话中明确指定 Application：

```text
使用 reviewer Agent 审查当前改动，重点检查行为回归。
```

Main Agent 会通过 `spawn_agent` 启动 `reviewer`。Agent.md 的 `background` 是用户
配置的调度默认值；Main Agent 也可以根据本次委派是否存在结果依赖显式覆盖。
foreground 任务完成后直接返回结果；background 任务立即返回 Agent ID，并在完成时
通过事件和 Session 通知自动回传结果。当前 Session 的 Main Agent 会在安全边界自动
继续任务，不需要用户再次输入。

> dscode 内置 `general` 和 `vision`。`explore`、`plan`、`reviewer` 等名称不是内置类型，
> 使用前必须存在对应 Agent.md。`spawn_agent` 仍要求显式选择 Application，不会因省略名称
> 隐式启动 `general` 或 `fork`。

## 文件格式

Agent.md 是带 YAML frontmatter 的 Markdown：

```markdown
---
name: explorer
description: Explore a codebase without changing files
tools:
  - Read
  - Glob
  - Grep
model: sonnet
effort: medium
permissionMode: plan
maxTurns: 12
skills: []
memory: project
---

Inspect the requested area. Trace the execution path and report evidence.
Do not modify files.
```

Markdown 正文是 SubAgent 的 system prompt。若未声明 `name`，文件名就是
Application name，例如 `code-reviewer.md` 对应 `code-reviewer`。

## 发现目录与优先级

dscode 同时支持原生目录和 Claude Code 目录：

| 优先级 | 来源 | 目录 |
|---:|---|---|
| 1 | Bundled | `resources/agents/*.md` |
| 2 | Claude Code 用户级 | `~/.claude/agents/*.md` |
| 3 | dscode 用户级 | `~/.dscode/agents/*.md` |
| 4 | Claude Code 项目级 | `<project>/.claude/agents/*.md` |
| 5 | dscode 项目级 | `<project>/.dscode/agents/*.md` |
| 6 | Managed policy | `DSCODE_MANAGED_AGENTS_DIR/*.md` |

数字越大优先级越高。同名文件按 Application 的最终 `name` 覆盖；高优先级文件
未声明的字段会继承低优先级配置，正文 system prompt 由高优先级文件替换。

Registry 在启动时加载；切换项目路径时会重新加载项目级配置。直接编辑 Agent.md
后，重启 dscode 可确保新配置生效。运行中的 Process 持有启动时的不可变 snapshot，
后续配置变化不会修改该 Process。

Main Agent 可在 `spawn_agent` 的工具描述中看到 Registry 当前所有有效 Application 的
名称与 description。执行专业任务时应优先选择职责匹配的 Agent.md；没有匹配项时显式使用
`general`，通过本次任务 Prompt 定义动态角色。

## Claude Code 兼容

dscode 可直接读取 `~/.claude/agents` 和 `<project>/.claude/agents`，并转换常用
Claude Code 工具名：

| Claude Code | dscode |
|---|---|
| `Read` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `edit` |
| `Glob` | `glob` |
| `Grep` | `grep` |
| `Bash` | `bash` |
| `Agent`, `Task` | `spawn_agent` |

兼容表示复用目录、Markdown 结构和已支持字段，不代表所有 Claude Code 扩展都已
实现。未知字段会使该 Application 加载失败，不会被静默忽略。

## 字段参考

| 字段 | 当前行为 |
|---|---|
| `name` | Application 名；缺省为文件名，仅允许字母、数字、`_`、`-` |
| `description` | Application 用途说明 |
| Markdown 正文 | 必填，作为 system prompt |
| `tools` | capability allowlist；`["*"]` 表示父进程允许的全部工具；`[]` 表示无工具 |
| `disallowedTools` | capability denylist，优先于 `tools` |
| `model` | `inherit`、`vision`、`provider/model`、当前 provider 的 model ID，或模型别名 |
| `effort` | `off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`，或 0–1 数值 |
| `permissionMode` | `default`、`acceptEdits`、`plan`、`bypassPermissions` |
| `maxTurns` | 正整数；达到上限后终止 Agent loop |
| `skills` | 启动时将已安装 Skill 的说明注入 Application prompt |
| `memory` | `user`、`project`、`local` Application Memory |
| `background` | 用户配置的缺省调度方式；单次 `spawn_agent.background` 显式值优先 |
| `isolation` | 当前仅支持 `worktree` |
| `fallback` | 当前仅注册 `ocr` handler 与指定失败事件 |
| `initialPrompt` | 已解析并保存，当前 `spawn_agent` 仍要求显式 `input.prompt` |
| `color` | 已解析并保存，当前 UI 不依赖该字段 |
| `mcpServers` | 尚未支持；非空配置会产生诊断并拒绝加载 |
| `hooks` | 尚未支持；非空配置会产生诊断并拒绝加载 |

`runtime` 和 `entrypoint` 不是合法字段。任何来源声明它们都会加载失败。

## 模型配置

```yaml
model: inherit                  # 使用 Main Agent 当前模型
model: deepseek/deepseek-chat   # 明确 provider/model
model: sonnet                   # 通过 agentModelAliases 解析
model: vision                   # 使用 ~/.dscode/config.json 中的 Vision 模型
```

Claude Code 风格的 `haiku`、`sonnet`、`opus` 不绑定固定 provider，需要在
`~/.dscode/settings.json` 配置：

```jsonc
{
  "agentModelAliases": {
    "haiku": "deepseek/deepseek-v4-flash",
    "sonnet": "deepseek/deepseek-v4-pro",
    "opus": "anthropic/claude-opus-4-1"
  }
}
```

未配置的别名无法启动对应 Application。

## 工具、权限与隔离

### MCP 工具

MCP Server 由 Harness 统一连接，不由单个 Agent Process 各自启动。每个 Harness
持有一个 `MCPManager`，合并 `~/.mcp.json` 与 `<project>/.mcp.json` 中的
`mcpServers`；同名 Server 以项目级配置为准。可以将其理解为外部设备通过统一的
MCP/USB 总线接入 Harness，再由 Harness 将设备能力注册为 Tool。

Agent.md 负责声明 Process 可以使用哪些已注册 Tool。MCP Tool 使用完整规范名
`mcp__<server>__<tool>`，可以直接写入 `tools`：

```yaml
tools:
  - Read
  - mcp__github__search_repos
  - mcp__github__get_file_contents
```

该写法受以下边界约束：

- MCP Server 必须已通过 `.mcp.json` 配置、成功连接并注册对应 Tool；
- `tools` 使用精确 Tool 名，当前不支持 `mcp__github__*` 这类 Server 级通配符；
- `tools: ["*"]` 或省略 `tools` 会继承父 Process 允许的全部 Tool，包括 MCP；
- `tools: []` 表示不授予任何 Tool，MCP Tool 也不会隐式加入；
- `disallowedTools`、父 Process deny 与 permission rules 对 MCP 和内置 Tool 一视同仁；
- Agent.md 中的非空 `mcpServers` 尚未支持，Server 连接配置必须放在 `.mcp.json`。

因此，`tools: [mcp__github__search_repos]` 是当前支持的 MCP capability 声明；
它授权 Application 使用 Harness 已连接的 GitHub MCP Tool，但不会创建新的
GitHub MCP Server 连接。

SubAgent 的最终 capability 是以下约束的交集：

1. Main Agent 当前可用工具；
2. Application 的 `tools`；
3. Application 的 `disallowedTools`；
4. permission mode；
5. attachment 与 Worktree 隔离规则。

安全边界：

- SubAgent 默认不能调用 `spawn_agent`，当前最大深度为 1；
- `permissionMode: plan` 会移除写文件和 Shell capability；
- background Agent 没有 `isolation: worktree` 时不能获得写文件或 Shell capability；
- `bypassPermissions` 只允许 managed policy 目录使用；
- 相对路径按各 Process 的独立 cwd 解析，SubAgent 不修改全局 `process.cwd()`。

需要后台修改文件时：

```yaml
tools: [Read, Write, Edit, Glob, Grep, Bash]
isolation: worktree
```

启动时必须由 Agent.md 的 `background: true` 或本次 `spawn_agent` 的
`background: true` 使后台模式生效。Agent.md 表达用户默认决策；Main Agent 可根据
本次动态委派显式覆盖。后续步骤依赖 SubAgent 结果时使用 `background: false`；
任务可独立执行时才使用 `background: true`。

有改动的 Worktree 会保留在退出结果中；无改动的 Worktree 自动清理。

## 前台、后台与进程控制

Main Agent 可使用以下进程工具：

| 工具 | 用途 |
|---|---|
| `spawn_agent` | 启动指定 Application，并可覆盖本次委派的 foreground/background |
| `list_agents` | 查看子进程及状态 |
| `background_agent` | 将 foreground Process detach 到后台，不重启 Runtime |
| `send_agent_message` | 向运行中的 Process 发送补充要求 |
| `terminate_agent` | 请求协作式终止 |
| `kill_agent` | 立即中止 |
| `suspend_agent`, `continue_agent` | Runtime 支持时暂停或继续；Pi Runtime 当前不支持 suspend |

模型不使用 `wait_agent` 或 `get_agent_output` 轮询。foreground 结果由
`spawn_agent` 直接返回；background 结果通过 `agent:exit` 和父 Session 通知自动
传递，并在当前 Main turn 结束后的安全边界自动触发 continuation。Supervisor 内部仍
可等待或查询进程，供 Runtime、UI、测试和系统调度使用。

`spawn_agent` 默认使用 minimal context。`selected` context 可显式选择消息、工具结果、
文件或 diff；`fork` context 当前仍被 evaluation gate 禁用。

将项目内刚生成的图片传给 SubAgent 时，使用 `file` attachment 的 `uri` 指向父 Agent cwd
内的本地路径或 `file://` URI。`spawn_agent` 会校验真实路径、20MB 大小上限并写入
ImageCache，再向 Runtime 传递标准 ImageRef。`image_ref.hash` 只接受已经存在的缓存文件名，
不能填写本地路径或 `file://` URI。

## General Application

dscode 随发行包提供 [`resources/agents/general.md`](../resources/agents/general.md)。
`general` 是普通 bundled Agent.md，不是专用 Runtime 或 Application 类型：

- `model: inherit` 使用 Main 当前选择的 provider/model；
- `tools: ["*"]` 请求继承父 Process 允许的 capability，最终仍经过 deny、权限、attachment
  和隔离规则过滤；
- 每次启动创建独立 Runtime 和 fresh transcript；
- 不复制 Main system prompt 或父 transcript；
- 父 Agent 通过任务 Prompt、文件路径、attachment 或 selected context 提供必要输入；
- SubAgent 默认不能再次调用 `spawn_agent`。

Skill 可以把 Researcher、Reviewer 等作为逻辑角色：先选择 Registry 中 description 匹配的
专业 Agent.md，否则启动 `general`。Skill 负责任务图、串并行依赖、产物和归并；Harness
只负责发现、隔离、运行和返回结果。

每次调用 `spawn_agent` 时，`description` 使用 `<Role>: <purpose>`，例如
`Researcher: verify paper claims`。Agent Activity Card 显示 `Researcher`，而
`general` 仅作为内部 Application 保留在 Process Store 和诊断数据中。旧 Session
缺少持久化 description 时，显示层会优先从原始 `spawn_agent` Tool Call 恢复角色；
内置 vision Application 显示为 `Vision`，其余仍无法恢复的角色统一显示 `SubAgent`。

## Vision Application

dscode 随发行包提供 [`resources/agents/vision.md`](../resources/agents/vision.md)。
Vision 不是专用 Pipeline Runtime，而是普通 Agent Process：

- 图片通过通用 attachment 传入；
- 使用 `model: vision` 解析 Vision 配置；
- `tools: []`、`skills: []` 保持最小 capability；
- 模型不可用、请求失败或输出为空时，在同一 agentId 下执行 OCR fallback；
- Activity 与其他 SubAgent 一样显示在 Terminal 和 Web 对话中。

当前发行包内置 `general` 和 `vision` Application；CHIEF Eval workers 也以 bundled
Agent.md 发行，但只服务对应 Eval 流程。

## 启用、数据与诊断

在 `~/.dscode/settings.json` 或项目 `.dscode/settings.json` 中启用：

```jsonc
{
  "agents": { "enabled": true }
}
```

`DSCODE_AGENTS_ENABLED=false` 可关闭进程工具并回退到单 Main Agent 行为。

Process 记录保存在：

```text
~/.dscode/data/agent-processes/by-project/<project>/<agentId>.json
```

父 Session 只在 `agentMessages` 中保存轻量关联，不混入完整 SubAgent transcript。
Agent.md 解析错误、未知字段、非法权限或不支持能力会写入启动日志中的
`AgentApplication` diagnostics。出现 `Unknown Agent application` 时，检查：

1. 文件是否位于发现目录且扩展名为 `.md`；
2. `name` 是否与请求中的 Application 完全一致；
3. Markdown 正文是否非空；
4. frontmatter 是否包含未知或未支持字段；
5. 编辑配置后是否已重启 dscode。

完整进程模型见 [Architecture](ARCHITECTURE.md#agent-进程模型)。
