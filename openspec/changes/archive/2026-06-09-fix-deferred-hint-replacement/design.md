## Context

`Harness.initialize()` 构建 system prompt 时，`__DEFERRED_HINT__` 占位符在传给 Agent 前未被替换。同文件 `reloadProject()` 方法（line 722-723）已正确处理：

```ts
this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection);
this.agent.state.systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());
```

而 `initialize()` 中遗漏了 `.replace()` 调用：

```ts
this.baseSystemPrompt = this.buildSystemPrompt(memories, skillSection);
const systemPrompt = this.baseSystemPrompt;  // ← 缺替换
```

## Goals / Non-Goals

**Goals:**
- 让 `initialize()` 中初始 system prompt 的 `__DEFERRED_HINT__` 被正确替换
- 与 `reloadProject()` 保持一致的替换模式

**Non-Goals:**
- 不改变 `transformContext` 中的替换逻辑（它已正确工作）
- 不改变 `baseSystemPrompt` 的构建方式

## Decisions

**单一抉择：在 line 111 补齐 `.replace()`**

```ts
const systemPrompt = this.baseSystemPrompt.replace("__DEFERRED_HINT__", this.toolRegistry.buildDeferredToolsHint());
```

理由：与 `reloadProject()` 保持完全一致的替换模式，`buildDeferredToolsHint()` 在无 deferred tools 时返回空字符串，语义正确。

## Risks / Trade-offs

无风险。`buildDeferredToolsHint()` 在 `initialize()` 调用时 `ToolRegistry` 已完成 `register(makeDiscoveryDriver(...))`，返回结果与 `transformContext` 中一致。
