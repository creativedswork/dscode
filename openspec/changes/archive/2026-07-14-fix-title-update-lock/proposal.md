## Why

`extractSessionTitle()` 的 Pass 1 已经能正确找到最新的 human message 作为 title candidate，但 `isTitleBetter()` 的守卫逻辑过于严格 — title 一旦被设为 ≥10 字符就永久锁定，导致后续更相关的 human message 永远无法替换早期 command argument 产生的 title。session 00MRKC4F 就是一个典型案例：title 始终停在第一条 command 的 argument，用户后续发的实质性消息被忽略。

## What Changes

- **修复 `isTitleBetter`**: 放宽替换条件，允许 title 在 candidate 内容实质性变化时更新，而非仅基于长度阈值锁死
- **保留降级规则**: 唯一不替换的情况是 candidate 是 current 的截断版本（前缀匹配且更短），此时保持更长的旧 title

## Capabilities

### Modified Capabilities

- `session-title-extraction`: `isTitleBetter` 的替换策略从"≥10 字符即永久锁定"改为"内容实质性变化时总是更新，仅前缀截断时保留旧 title"

## Impact

- **代码**: `src/session/manager.ts` — `isTitleBetter()` 函数
- **测试**: 更新 title extraction 测试，覆盖 topic shift 场景和前缀截断场景
- **行为变更**: 之前一旦 title 不为 "New session" 且 ≥10 字符就永不更新；之后会在用户发送新的实质性消息时自动更新 title
