## Context

pi-tui 的 `Editor` 组件在 autocomplete 激活时对 slash 命令有特殊行为：Enter 确认选择后 **intentionally falls through to submit**。代码注释 `// Fall through to submit` 表明这是故意设计。

dscode 的 TUI 使用 pi-tui 的 `Editor` + `CombinedAutocompleteProvider`，在 `src/ui/tui-app.ts` 中通过 `HybridAutocompleteProvider` 封装了一层来同时支持 slash 命令和 `@file` 补全。

当前 `handleSubmit` 中已有类似模式：custom command 在无参数时会回填 editor（`this.editor.setText(text + " ")`）。本次修改将该行为扩展到所有 slash 命令的 autocomplete 场景。

## Goals / Non-Goals

**Goals:**
- Enter 选择 slash 命令后仅填入不执行，让用户能加参数
- Tab 行为不变（已正确：仅填入不提交）
- 非 autocomplete 场景的 Enter（手动完整输入命令后按 Enter）不受影响
- 不修改 node_modules 中的 pi-tui 代码

**Non-Goals:**
- 不改变 `@file` 或文件路径补全的行为
- 不改变 Web UI 行为（Web UI 有自己的处理逻辑）
- 不修改 `/reset` 等单次命令的 UX（即使选中了 `/reset` 也会回填，需再按一次 Enter）

## Decisions

### Decision 1: Timestamp-based detection

**选择**: 在 `applyCompletion` 触发时记录时间戳，`handleSubmit` 中比较。

```typescript
// HybridAutocompleteProvider
private onSlashAutocomplete?: () => void;

// applyCompletion 中，slash 补全时调用
if (isSlashCompletion) this.onSlashAutocomplete?.();

// TuiApp
private lastAutocompleteMs = 0;

// handleSubmit 中
if (text.startsWith("/") && Date.now() - this.lastAutocompleteMs < 100) {
  this.editor.setText(text + " ");
  return;
}
```

**替代方案**: boolean flag `justAutocompleted`。风险是 Tab 补全（不提交）也会设 flag，下次正常提交时可能误触发。timestamp 方案不存在此问题：Tab 补全后用户需要继续输入，必然超过 100ms。

### Decision 2: 100ms 阈值

**选择**: 100ms 窗口。`applyCompletion` → `onChange` → `onSubmit` 在同一 event loop tick 内完成（< 1ms），100ms 足够覆盖任何正常延迟同时远远小于人类输入间隔。

### Decision 3: 所有 slash 命令统一回填

**选择**: 所有 slash 命令（包括无参数的如 `/reset`、`/help`）在 autocomplete 后都回填。用户需再按一次 Enter 确认。

**替代方案**: 仅对有子命令的命令（`/session`、`/config` 等）回填。但这样会导致 `Tab` 和 `Enter` 行为不一致——Tab 填入后不执行，Enter 填入后立即执行。统一回填是更一致的用户心智模型。

## Risks / Trade-offs

- **[Low] 正常快速输入被误判**: 用户在 100ms 内手动输入 `/reset` 并 Enter → 回填了。实际场景极罕见——100ms 完成输入+按键几乎不可能。
- **[Low] `/reset`、`/help` 等无参命令需要双击 Enter**: 第一次选中回车填入，第二次回车执行。这是接受的 trade-off。
- **[None] 回填后光标位置**: `editor.setText(text + " ")` 将光标放在末尾空格后，与 custom command 行为一致。
