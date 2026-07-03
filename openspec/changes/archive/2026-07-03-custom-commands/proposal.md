## Why

目前 dscode 缺少一种轻量级的用户自定义 prompt 模板机制：Skills 太重（需要声明 tools、管理激活状态），Memory 太隐式（自动注入，用户无感），AGENTS.md 太全局（一个文件管所有）。用户需要能通过 `/` 快速调出自己定义的 prompt 模板，填入内容后发送给 LLM 执行——类似自定义 slash command。

## What Changes

- 新增 `.dscode/commands/` 目录支持（用户级 `~/.dscode/commands/` + 项目级 `<project>/.dscode/commands/`），支持子目录递归扫描
- 每个 command 是一个 Markdown 文件（YAML frontmatter + prompt 模板体），`$input` 占位符接收用户输入；command name 由文件相对路径派生：`commands/<name>.md` → `/name`，`commands/<subdir>/<name>.md` → `/subdir:name`
- 在 slash command 列表中自动展示自定义 commands（插入内置 commands 前）
- System prompt 中列出可用 commands（名称 + 描述），让 LLM 可主动建议用户使用
- 项目级 commands 优先级高于用户级（同名覆盖）

## Capabilities

### New Capabilities
- `custom-commands`: 用户通过 `.dscode/commands/<name>.md` 或 `.dscode/commands/<subdir>/<name>.md` 定义可复用的 prompt 模板，在输入框中通过 `/` 调出并发送。子目录中的文件映射为 `<subdir>:<name>` 格式的 slash command（如 `opsx/apply.md` → `/opsx:apply`）

### Modified Capabilities
- `system-prompt-structure`: system prompt 章节顺序中新增 `# Commands` 章节（在 Skills 之后）
- `slash-command-context`: 自定义 commands 的数据来源从 `SlashCommandDef[]` 扩展为内置 + 自定义的混合列表

## Impact

- `src/core/config.ts` — 新增 `userCommandsDir` / `projectCommandsDir` 路径计算
- `src/core/harness.ts` — 集成 CommandManager，`buildSystemPrompt()` 新增 Commands section
- `src/core/types.ts` — 新增 `CommandManifest` 类型
- `src/ui/commands.ts` — slash command 列表合并自定义 commands
- `src/ui/web/` — Web UI 输入框 `/` 自动补全列表含自定义 commands
- 新增文件：`src/commands/loader.ts`（递归扫描）、`src/commands/manager.ts`
- `.dscode/commands/opsx/` — 示例子目录 commands（apply, archive, explore, propose, code-review）
- `.dscode/commands/opsx/` — 示例子目录 commands（apply, archive, explore, propose, code-review）
