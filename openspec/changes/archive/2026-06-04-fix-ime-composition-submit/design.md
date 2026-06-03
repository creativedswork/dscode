## Context

`MessageInput` 组件的 `handleKeyDown` 在第 279 行对 Enter 键（无 Shift）做了硬拦截：

```ts
if (e.key === "Enter" && !e.shiftKey) {
  e.preventDefault();
  if (!processing) handleSubmit();
}
```

中文输入法（拼音/五笔/微软拼音等）在输入英文时会进入 IME Composition 状态（浏览器触发 `compositionstart` 事件）。用户按 Enter 确认组合文字时，浏览器同时触发 `keydown` (Enter) 和 `compositionend`。当前代码仅判断 `e.key === "Enter"`，未区分是否处于 composition 状态，导致 Enter 被错误地当作消息提交。

## Goals / Non-Goals

**Goals:**
- IME 组合态下按 Enter 确认文字时不触发消息提交
- 非 IME 组合态下 Enter 提交行为保持不变
- 修改范围最小化，仅影响 `MessageInput.tsx`

**Non-Goals:**
- 不改变 Shift+Enter 换行行为
- 不改变其他快捷键行为
- 不涉及其他输入框（本组件是唯一的多行文本输入）

## Decisions

### 方案选择：`compositionstart`/`compositionend` + ref

使用 `useRef<boolean>` 追踪 IME 组合状态，在 `textarea` 上绑定 `onCompositionStart` 和 `onCompositionEnd` 事件。`handleKeyDown` 中先检查 ref，若为 `true` 则跳过 Enter 提交逻辑。

**备选方案：`e.nativeEvent.isComposing`**

`KeyboardEvent.isComposing` 是 DOM 标准属性，当 keydown 事件发生在 IME 组合期间时返回 `true`。React 的 SyntheticEvent 已将其暴露为 `e.nativeEvent.isComposing`。

**选择 ref 方案的理由**：
- `compositionstart`/`compositionend` 是业界标准做法（React 官方文档、MUI、Ant Design 等均采用此模式）
- `isComposing` 属性在不同浏览器/OS/输入法组合下存在已知的边缘行为差异（如某些输入法在 compositionend 之后仍可能标记 keydown.isComposing 为 true）
- ref 方案可以确保 100% 可靠，不依赖浏览器对 `isComposing` 的实现一致性

### 实现细节

```tsx
const isComposingRef = useRef(false);

// 在 textarea 上添加：
onCompositionStart={() => { isComposingRef.current = true; }}
onCompositionEnd={() => { isComposingRef.current = false; }}

// handleKeyDown 中 Enter 分支改为：
if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
  e.preventDefault();
  if (!processing) handleSubmit();
}
```

注意：不需要在 Enter 分支中额外调用 `e.preventDefault()` 阻止 composition 行为，因为 composition 由浏览器/IME 自身处理，我们的 ref 检查只是跳过提交。

## Risks / Trade-offs

- **[低风险] 极少数输入法不触发 composition 事件**：如果某个输入法完全不触发 `compositionstart`/`compositionend`，ref 始终保持 `false`，行为与修复前一致。已知所有主流中/日/韩输入法均正确触发这些事件。
