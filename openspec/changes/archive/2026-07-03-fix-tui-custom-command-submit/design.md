## Context

自定义 command 在 `custom-commands` change 中实现，TUI 端在 `handleSubmit` 中集成了 `resolveCustomCommand`。但展开后的 prompt 文本被错误地传给了键盘事件处理器 `handleInput`。

### 当前流程（有 Bug）

```
handleSubmit("/opsx:apply")
  → executeSlashCommand() → undefined（不是 built-in）
  → resolveCustomCommand() → "请实现 tasks.md..."
  → this.handleInput("请实现 tasks.md...")  ← ❌ 键盘事件处理器，文本被无视
```

### `handleInput` vs `handleSubmit` 职责对比

| 方法 | 职责 | 参数 |
|------|------|------|
| `handleInput(data: string): boolean` | 原始终端键盘事件（↑↓←→, Esc, Enter 等） | 键盘字节序列，如 `\x1b[A` |
| `handleSubmit(text: string): void` | 用户文本提交后处理（发送给 AI） | 普通文本，如 `"hello"` |

此外 L1122-L1128 存在一段与 L1109-L1121 重复的 `/` 命令检查代码，是合并残留。

## Goals / Non-Goals

**Goals:**
- 修复自定义 command 在 TUI 中按回车无响应的问题
- 清理重复代码

**Non-Goals:**
- 不改变自定义 command 的解析逻辑（`resolveCustomCommand` 本身正确）
- 不涉及 Web UI（`web-backend.ts` 的 `handleSlashCommand` 正确使用 `promptAndSave`）
- 不改变 autocomplete 行为

## Decisions

**Decision: `handleInput(expanded)` → `handleSubmit(expanded)`**

`handleSubmit` 内部已有完整的 `/` 命令分发逻辑，且展开后的 prompt body 不以 `/` 开头，会自然走到普通对话流程。这与 Web 后端的处理方式一致（`promptAndSave`）。

替代方案考虑过直接调用 `this.deps.agent.prompt(expanded)` 但需要重复处理图片、at-file 等逻辑，不如复用 `handleSubmit`。

## Risks / Trade-offs

- **Risk**: `handleSubmit` 递归调用可能意外触发某些副作用 → **Mitigation**: `handleSubmit` 是纯同步状态检查，展开的文本不以 `/` 开头，不会有循环风险
