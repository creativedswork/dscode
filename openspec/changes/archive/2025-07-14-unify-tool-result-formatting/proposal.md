## Why

工具结果（特别是 `write_file` / `overwrite_file` 的锚点预览）在前端展示时文本量极大（3000+ 字符），导致 Web UI 卡顿、无法滚动。这个问题**之前修过，又出现了**。

根因是系统中存在**两条相互独立的展示管道**，各自实现了不一致的截断逻辑：

| | Live 路径 (`web-backend.ts:122`) | History 路径 (`display.ts:55`) |
|---|---|---|
| 触发时机 | 实时工具执行完成 | 加载历史会话 |
| 截断行为 | `slice(0, 5000)` — 太宽松 | 之前**无截断**，刚临时加了 `MAX_RESULT=600` |
| `write_file` 结果 (~3000 字符) | **通过** (5000 > 3000) | **通过了** (无限制) |

任何一边的修改不会影响另一边，"修一边漏一边"是必然结果。

## What Changes

1. **新增** `src/ui/shared/tool-result-formatter.ts` — 单一扼流点，所有工具结果必经此函数
2. **修改** `web-backend.ts:122` — Live 路径改为调用 formatter
3. **修改** `display.ts:extractToolResultText` — History 路径改为调用 formatter
4. **删除** 两处各自的临时截断逻辑（`slice(0,5000)` / `MAX_RESULT=600`）

Formatter 行为：
- `write_file` / `overwrite_file` → 提取前两行摘要（"Written X bytes to path" + "New file version: ..."），锚点预览折叠为 `… (N more lines — anchor preview hidden)`
- `bash` / 未知工具 → 默认截断 600 字符，附加截断提示
- 工具可扩展 — 新增 case 即可添加工具特定格式化

## Capabilities

### New Capabilities
- `tool-result-formatting`: 统一的工具结果 → UI 展示文本格式化，工具感知的摘要提取，安全兜底截断

### Modified Capabilities
- `tool-execution-display`: Live 和 History 两条路径现在共享同一个 formatter，行为一致
- `session-history-load`: `rebuildDisplayMessages` 中的 `extractToolResultText` 不再自行截断，委托给 formatter

## Impact

- `src/ui/shared/tool-result-formatter.ts` — **新增**，formatter 函数
- `src/ui/web/web-backend.ts` — **修改**，`tool:end` 事件处理器改为调用 formatter
- `src/session/display.ts` — **修改**，`extractToolResultText` 改为调用 formatter
- `web/src/components/ToolCard.tsx` — **不变**，`max-h-40 overflow-y-auto` 保持不变作为防御
