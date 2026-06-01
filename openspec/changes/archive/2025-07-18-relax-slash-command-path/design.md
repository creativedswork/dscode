## Context

当前 slash command 的判断分散在两个位置：

1. **客户端** `MessageInput.tsx:77`：`startsWith("/") && !includes(" ")` → 发 `{ type: "slash" }` 
2. **服务端** `web-backend.ts:325`：`startsWith("/")` → 即使收到 `chat` 类型也重路由到 `handleSlashCommand`

这种双重检测导致 Unix 绝对路径（如 `/Users/foo/bar.ts`）无法作为聊天内容传递。用户拖入文件或输入路径时被「Unknown command」错误阻断。

## Goals / Non-Goals

**Goals:**
- 已知 slash command（如 `/help`、`/config`、`/session`）保持正常执行
- Unix 绝对路径 `/Users/foo/bar.ts` 能作为普通聊天消息发送给 AI
- `/` 输入时 slash 补全菜单保持显示
- 不引入 breaking changes

**Non-Goals:**
- 不改变 TUI 模式下的 slash command 行为（TUI 有自己的输入解析）
- 不添加新的文件路径验证逻辑
- 不改变 slash command 的注册/扩展机制

## Decisions

### Decision 1: 客户端统一走 chat 通道

**选择**：`MessageInput.handleSubmit` 移除 `startsWith("/")` 分支，所有文本统一作为 `{ type: "chat" }` 发送。

**理由**：客户端不应承担命令路由职责。让服务端统一决策，避免两端逻辑不一致。

**替代方案**：在客户端加路径检测（检查多个 `/` 或扩展名）。缺点是客户端和服务端逻辑重复，且边缘情况（如 `/Users`）不好处理。

### Decision 2: 服务端用「首词匹配已知命令」替代盲目的 `startsWith("/")`

**选择**：在 `web-backend.ts` 的 `chat` handler 中，检测 `text.startsWith("/")` 后，取第一个 `/` 后的第一个词（按空白分割），仅在匹配 `COMMANDS` 列表中的已知命令时才路由到 `handleSlashCommand`。

```
/help              → 首词 "help"    → 已知 → 执行命令
/config key xxx    → 首词 "config"  → 已知 → 执行命令
/Users/foo/bar.ts  → 首词 "Users/foo/bar.ts" → 未知 → 正常 chat
/foo               → 首词 "foo"     → 未知 → 正常 chat
```

**理由**：最小改动，精确匹配已知命令名，不会误杀路径。`getSlashCommandAutocomplete()` 已经导出命令列表，可直接复用。

### Decision 3: `executeSlashCommand` 返回执行结果

**选择**：将 `executeSlashCommand` 的返回类型从 `void` 改为 `boolean`（`true` = 命令已执行，`false` = 未知命令）。

**理由**：让调用方（`handleSlashCommand` 和 TUI）能区分「已执行」和「未知命令」，web backend 在未知时可以 fallback 为 chat。

**TUI 行为**：TUI 模式下仍然显示 "Unknown command" 错误——因为 TUI 有显式的 slash command 入口，用户意图明确。只有 Web UI 走宽松策略。

**替代方案**：在 `handleSlashCommand` 中调用前检查命令是否存在。缺点是需要访问命令列表，且代码重复。

### Decision 4: Slash 补全菜单保持不变

`MessageInput` 中 `text.startsWith("/")` 触发 `showSlashMenu` 的逻辑完全保留。用户输入 `/` 时依然会弹出命令补全列表，只是提交时不再被强制路由为 slash command。

## Risks / Trade-offs

- **风险**：用户手打 `/foo`（不是路径、不是命令）现在会被发给 AI 当聊天，而不是得到 "Unknown command" 错误。
  - **缓解**：这是有意为之。slash 补全菜单仍会提示可用命令，用户可以看到 `/foo` 不在列表中。如果确实是输错了命令，AI 看到 `/foo` 也会正常回应。
  
- **风险**：`/session load` 等带参数的命令通过 chat 通道而非 slash 通道执行，行为是否有差异？
  - **缓解**：`handleSlashCommand` 的 mockTui 与命令执行逻辑独立于通道。chat 通道识别为命令后仍调同一函数，行为完全一致。

- **风险**：TUI 和 Web UI 对未知命令的行为不一致。
  - **缓解**：TUI 是 terminal 交互模式，用户显式触发命令，报错合适。Web UI 是自由文本输入，混入路径正常。差异是合理的。
