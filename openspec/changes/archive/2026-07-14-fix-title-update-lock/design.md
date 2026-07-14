## Context

`src/session/manager.ts` 中的 `isTitleBetter()` 是 title 更新的最后一道闸门。`extractSessionTitle()` 已经实现了正确的 3-pass 提取策略（human message > command argument > 兜底），但 `isTitleBetter` 的长度守卫使其返回的 candidate 无法生效。

当前实现：

```typescript
function isTitleBetter(current: string, candidate: string): boolean {
  if (!current || current === "New session") return true;
  // current.length < 10 → 这个条件使得一旦 title ≥10 字符就永久锁定
  if (current.length < 10 && candidate.length >= current.length + 5) return true;
  return false;
}
```

问题：session 的第一条 command message（如 `/opsx:apply fix session title extraction bug`）产生的 title "fix session title extraction bug" 已经有 34 字符，之后用户发送的任何新 human message 都无法替换它。

## Goals / Non-Goals

**Goals:**
- `isTitleBetter` 允许 title 在内容实质性变化时更新
- 唯一保留旧 title 的情况：candidate 是 current 的前缀截断（更短的同一内容）
- 保持简单，不引入消息来源追踪

**Non-Goals:**
- 改变 `extractSessionTitle` 的 3-pass 策略
- 改变 title 最大长度 (60 chars)
- 改变 noise filter 或 command regex

## Decisions

### Decision 1: 替换策略 — 内容差异判断代替长度守卫

```typescript
function isTitleBetter(current: string, candidate: string): boolean {
  if (!current || current === "New session") return true;
  // candidate 是 current 的截断版本 → 保留 current
  if (candidate.length < current.length && current.startsWith(candidate)) return false;
  return true;
}
```

逻辑：`extractSessionTitle` 已经做了所有质量过滤（noise、长度、command 剥离），它返回的 candidate 就是当前最佳选择。唯一的例外是 candidate 仅仅是 current 的截断版本 — 此时保留更长的旧 title 更有信息量。

**替代方案考虑**:

| 方案 | 为何不选 |
|------|---------|
| 总是更新 (`return true`) | 会导致 title 从 "Debug session manager title extraction logic" 变成更短的 "Debug session"（虽然是同一主题的截断） |
| 长度守卫 (`candidate.length >= current.length`) | "Debug session manager title extraction logic" (42 chars) vs "Actually the bug is in isTitleBetter" (40 chars) → 后者更相关但长度不够，被拒绝 |
| 记录消息来源（Pass 1/2/3）并在 `isTitleBetter` 中使用 | 过度设计，需要改动函数签名和调用处 |

当前方案（前缀截断守卫）最简洁，处理了唯一真正该阻止的情况。

### Decision 2: 不改 `extractSessionTitle` 的 3-pass 结构

Pass 1 (human message) > Pass 2 (command argument) > Pass 3 (兜底) 的优先级已经正确。修好 `isTitleBetter` 后，Pass 1 的结果自然会在下一次 `saveSession` 时覆盖 Pass 2 的结果。

## Risks / Trade-offs

- **Risk**: 用户在 session 中讨论多个话题，title 频繁切换 → Mitigation: `extractSessionTitle` 的 reverse scan 保证了 title 反映最近的话题；频繁切换说明用户确实在切换话题，title 跟随是正确的
- **Risk**: candidate 恰好是 current 的前缀但实际是不同内容 → Mitigation: 极低概率事件，且 `candidate.length < current.length` 条件确保只有更短的 candidate 才会被拦截；如果不同内容恰好是前缀关系，这两个 title 本身就很相似，保留哪个都不会太差
