## Context

`extractSessionTitle()` 在 `src/session/manager.ts` 中实现了 3-pass 提取策略。`fix-title-update-lock` 修复了 `isTitleBetter` 的锁定问题，但暴露了 `pendingTitleHint` 的消费时序 bug：

- `pendingTitleHint` 在第一次 `extractSessionTitle()` 调用时被置 null
- `saveSession` 每个 `turn_end` 事件 + `agent_end` 事件各触发一次
- 第二次及后续调用时 hint 已空，Pass 1 命中注入的系统指令正文（role=user，非 command，非 noise，≥10 chars），标题被覆盖

当前调用方：
- `src/ui/tui-app.ts:1277` — `setPendingTitleHint(args)`
- `src/ui/web/web-backend.ts:723` — `setPendingTitleHint(cmdArgs)`

两者都在自定义命令解析后、agent prompt 前设置。

## Goals / Non-Goals

**Goals:**
- `titleIntent`（原 `pendingTitleHint`）在多次 `saveSession` 调用之间持久存在
- `titleIntent` 仅在 Pass 1 找到真正的非命令人类消息时才清除
- 重命名 `pendingTitleHint` / `setPendingTitleHint` 为语义更准确的名称
- 保持现有 3-pass 策略和 `isTitleBetter` 不变

**Non-Goals:**
- 改变 `isTitleBetter` 的替换策略
- 改变 title 最大长度 (60 chars)
- 改变 noise filter 或 command regex
- 改变 `saveSession` 的调用频率

## Decisions

### Decision 1: `titleIntent` 作为最高优先级，永不自动清除

当前的消费模式：

```
extractSessionTitle():
  if (pendingTitleHint) {
    hint = pendingTitleHint
    pendingTitleHint = null  // ← 消费后清空
    return hint
  }
  // Pass 1 → Pass 2 → Pass 3
```

新策略（调整后）：

```
extractSessionTitle():
  // titleIntent 作为最高优先，不清除
  if (titleIntent && titleIntent.length >= MIN_TITLE_LENGTH):
    return titleIntent[0:60]

  // Pass 1: 真正的人类消息
  // Pass 2: command argument
  // Pass 3: 兜底
```

**为什么 titleIntent 优先于 Pass 1？**

经过实际测试发现，Pass 1 无法区分「用户后续输入的真实消息」和「自定义命令注入的系统指令」（如 /opsx:explore 注入的长文本）。两者都具有 role=user、非命令、非噪声、长度足够等特征。若 Pass 1 优先，注入的系统指令会在第一次 saveSession 时就被选为标题，彻底覆盖 titleIntent。

将 titleIntent 设为最高优先级意味着：
- titleIntent 永不被 `extractSessionTitle` 清除，只在下次 `setTitleIntent()` 时更新
- 用户打开 session 时的命令参数始终作为标题来源
- 若用户后续切换到完全不同的任务，需要重新执行带参数的命令来更新标题

**替代方案**:

| 方案 | 为何不选 |
|------|---------|
| `titleIntent` 永远优先于 Pass 1 | 用户后续的实质性消息只有通过新的命令（触发 setTitleIntent）才能更新标题 |
| `titleIntent` 不清除但 Pass 1 优先 | 注入的系统指令会伪装成真实用户消息，覆盖 titleIntent |

### Decision 2: 命名 `pendingTitleHint` → `titleIntent`

`pending` 暗示一次性，`hint` 暗示可选。实际语义是"用户打开 session 时的真实意图"，应该作为可靠的标题来源持久存在。

`setTitleIntent()` 的调用在每次命令解析时自然覆盖旧值，无需额外清理逻辑。

### Decision 3: 不改 `isTitleBetter`

`isTitleBetter` 已经在 `fix-title-update-lock` 中修正为正确行为——允许内容实质性变化时更新，仅阻止前缀截断的降级。本次修改不涉及替换策略。

## Risks / Trade-offs

- **Risk**: 用户在一个 session 里先执行自定义命令（设置 titleIntent），然后切换到完全不同的任务 → titleIntent 仍然是旧的命令参数。Mitigation: 一旦用户发送任何非命令的实质性消息（Pass 1 命中），titleIntent 立即清除，标题更新为最新的人类输入。
- **Risk**: `setTitleIntent` 和 agent prompt 之间的时序——当前调用顺序是 `setTitleIntent` → `agent.prompt`，中间无异步操作，时序安全。
