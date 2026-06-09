## Why

`__DEFERRED_HINT__` 占位符在 `Harness.initialize()` 中构建初始 system prompt 时未被替换，导致 `--debug` dump 文件和 Agent 初始 state 中出现原始占位符文本。虽然运行时 `transformContext` 会在首次对话前替换它，但调试输出和状态初始化的语义不正确。

## What Changes

- `Harness.initialize()` 中 `systemPrompt` 的赋值增加 `.replace("__DEFERRED_HINT__", ...)` 调用，与 `reloadProject()` 方法保持一致的替换模式

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无 — 纯 bug 修复，不涉及 spec 级别的需求变更）

## Impact

- 仅影响 `src/core/harness.ts` 第 111 行
- 无 API 变更，无破坏性变更
