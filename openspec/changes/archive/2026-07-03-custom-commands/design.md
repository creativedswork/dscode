## Context

当前 dscode 的 prompt 扩展机制有三个层次：

1. **Skills**（重）：YAML frontmatter + instructions，需声明 tools，有 activate/deactivate 生命周期，instructions 在激活后注入 system prompt
2. **Memory**（隐式）：跨 session 持久化，自动注入 system prompt，用户无感知
3. **AGENTS.md**（全局）：单文件全文注入 system prompt，无选择性

Commands 填补第四个空白：**用户手动触发的即时 prompt 模板**——不需要 lifecycle，不需要 tools 声明，不自动注入任何地方。用户输入 `/` 调出，选中后 `$input` 替换为用户输入内容，整段作为 user message 发送。

## Goals / Non-Goals

**Goals:**
- 用户可通过 `.dscode/commands/<name>.md` 或 `.dscode/commands/<subdir>/<name>.md` 定义可复用的 prompt 模板
- 输入 `/` 时，自定义 commands 出现在自动补全列表中（在内置 commands 之前或之后）
- 选中 command 后，模板中的 `$input` 被替换为用户在命令名后输入的内容
- System prompt 列出所有可用 commands，LLM 可主动建议用户使用
- 项目级 commands 覆盖同名用户级 commands
- **子目录支持**：`commands/opsx/apply.md` → slash command `/opsx:apply`

**Non-Goals:**
- 不支持参数系统（`$1`, `$2` 等）——保持简单，只有一个 `$input`
- 不支持 command 嵌套引用其他 command
- 不支持 runtime 动态注册——commands 从文件系统扫描，启动时加载
- 不支持 command 执行脚本或调用工具——纯 prompt 模板

## Decisions

### 1. 文件格式：SKILL.md 同款 frontmatter + 路径派生名

```markdown
---
name: apply
description: Apply an OpenSpec change
---
Implement the change:

$input
```

- `name`（可选）：frontmatter 中的 name 字段。如存在则必须与路径派生名一致（用作 sanity check），否则跳过该文件并打印 warning。如不存在，command name 由文件路径自动派生
- `description`（必需）：在 `/` 下拉列表中展示
- body：prompt 模板，`$input` = 用户输入内容
- 项目级覆盖用户级（同名时 `source: "project"` 优先）
- **子目录**：`commands/<subdir>/<name>.md` → command name 为 `<subdir>:<name>`（路径分隔符 `/` 替换为 `:`），支持任意深度嵌套

**选择理由**：和 SKILL.md 格式一致，减少学习成本。路径派生名让文件组织结构直接反映命令层级，无需在 frontmatter 中重复声明命名空间。

### 2. 扫描与加载：递归扫描 + 路径派生

`src/commands/loader.ts`：递归扫描目录 → 从相对路径派生 name → 解析 frontmatter → 返回 `CommandManifest[]`

和 `skills/loader.ts` 一样：
- 用户级目录先扫，项目级后扫（同名覆盖）
- `description` 为必需字段，`name` 变为可选（sanity check）
- 缺失则跳过该文件

**子目录递归**：`scanDir` 递归扫描所有子目录。command name 从相对路径派生：
- `commands/code-review.md` → name = `code-review`
- `commands/opsx/apply.md` → name = `opsx:apply`
- `commands/a/b/foo.md` → name = `a:b:foo`

### 3. Slash command 集成：动态拼接

`src/ui/commands.ts` 中的 `COMMANDS` 数组从硬编码静态列表变为：

```
[自定义 commands...] + [内置 commands...]
```

具体方式：
- `SlashCommandContext` 扩展新增 `customCommands: CommandManifest[]`
- 输入 `/` 时，合并自定义 commands 的 `SlashCommandDef`（execute = 展开模板到输入框）
- 自定义 command 的 execute 逻辑：将 `$input` 替换为用户输入，作为新的 user message 发送

### 4. System prompt：轻量列出

在 `# Skills` 章节之后插入 `# Commands` 章节：

```
# Commands

## Available Custom Commands
- code-review: 标准代码审查清单
- opsx:apply: Apply an OpenSpec change
- opsx:archive: Archive a completed change
- deploy-checklist: 发布前检查清单
```

**不注入 instructions**（和 skills 不同）。LLM 只需知道有哪些 commands 可用，可以在对话中建议用户使用（"Try `/opsx:apply` to apply an OpenSpec change"）。

### 5. 数据结构

```typescript
interface CommandManifest {
  name: string;        // 路径派生名（<subdir>:<basename>），如 "opsx:apply"
  description: string; // 文件中的 description 字段（必需）
  body: string;        // frontmatter 之后的全部内容（含 $input 占位符）
  source: "user" | "project";
  path: string;        // 文件绝对路径
}
```

## Risks / Trade-offs

- **[文件变更不热加载]** → 和 skills 一致，需要重启。后续可考虑加入 config-watch。
- **[同名覆盖静默]** → 项目级覆盖用户级时不警告，可能让用户困惑。在 `/` 列表中标注 source 可缓解。
- **[大文件无限制]** → 暂不限制 command body 长度。由用户自行管理。
- **[和内置 commands 同名冲突]** → 自定义 commands 命名时可能和 `/help`、`/config` 等冲突。规则：**内置优先**——用户定义的 command 如果和内置同名，被内置覆盖。
- **[子目录深度]** → 支持任意深度嵌套，不做限制。深层嵌套的 command name 较长（如 `a:b:c:d:e`），但由用户自行管理。
- **[frontmatter name 与路径不一致]** → 打印 warning 并跳过该文件，不会静默忽略。
