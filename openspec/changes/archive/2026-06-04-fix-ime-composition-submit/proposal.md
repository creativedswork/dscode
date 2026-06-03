## Why

当使用中文输入法（如拼音、五笔等）输入英文时，输入法会在文本框中先展示组合态（composition）候选文字，用户需要按 Enter 键确认输入。但当前代码在 `handleKeyDown` 中直接将 Enter 事件拦截并触发了消息提交（`handleSubmit`），导致用户无法正常确认输入法文本——每次按 Enter 确认输入时，消息都会被提前发送。

## What Changes

- 在 `MessageInput` 组件中增加 IME 组合态追踪：通过 `compositionstart` / `compositionend` 事件或检查 `KeyboardEvent.isComposing` 来判断当前是否处于 IME 组合输入状态
- 当处于 IME 组合态时，Enter 键不触发消息提交，仅由输入法处理

## Capabilities

### New Capabilities
<!-- No new capabilities — this is a bug fix within existing input behavior -->

### Modified Capabilities
- `web-frontend`: Input area — Enter 键提交行为应在 IME 组合态下被抑制，仅当非组合态时才提交消息

## Impact

- `web/src/components/MessageInput.tsx`：`handleKeyDown` 函数增加组合态判断逻辑，新增 `compositionstart`/`compositionend` 事件处理
