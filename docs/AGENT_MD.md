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

Main Agent 会通过 `spawn_agent` 启动 `reviewer`。foreground 任务完成后直接返回
结果；background 任务立即返回 Agent ID，并继续在对话中更新 Activity。

> dscode 当前不会隐式提供 `general`、`explore`、`plan` 或 `reviewer`。
> 除内置 `vision` 外，使用前必须先创建对应的 Agent.md。

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
| `background` | 内部 spawn API 的缺省 attachment；`spawn_agent.background` 显式值优先 |
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

启动时还必须让 Main Agent 在 `spawn_agent` 调用中显式传入 `background: true`。
frontmatter 的 `background` 只作为内部 spawn API 缺省值，不覆盖显式调用参数。

有改动的 Worktree 会保留在退出结果中；无改动的 Worktree 自动清理。

## 前台、后台与进程控制

Main Agent 可使用以下进程工具：

| 工具 | 用途 |
|---|---|
| `spawn_agent` | 启动指定 Application |
| `list_agents` | 查看子进程及状态 |
| `wait_agent` | 等待指定进程退出 |
| `get_agent_output` | 查询当前状态或最终输出 |
| `background_agent` | 将 foreground Process detach 到后台，不重启 Runtime |
| `send_agent_message` | 向运行中的 Process 发送补充要求 |
| `terminate_agent` | 请求协作式终止 |
| `kill_agent` | 立即中止 |
| `suspend_agent`, `continue_agent` | Runtime 支持时暂停或继续；Pi Runtime 当前不支持 suspend |

`spawn_agent` 默认使用 minimal context。`selected` context 可显式选择消息、工具结果、
文件或 diff；`fork` context 当前仍被 evaluation gate 禁用。

## Vision Application

dscode 随发行包提供 [`resources/agents/vision.md`](../resources/agents/vision.md)。
Vision 不是专用 Pipeline Runtime，而是普通 Agent Process：

- 图片通过通用 attachment 传入；
- 使用 `model: vision` 解析 Vision 配置；
- `tools: []`、`skills: []` 保持最小 capability；
- 模型不可用、请求失败或输出为空时，在同一 agentId 下执行 OCR fallback；
- Activity 与其他 SubAgent 一样显示在 Terminal 和 Web 对话中。

当前发行包只内置 `vision` Application。

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
