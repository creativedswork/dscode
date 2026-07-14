## Why

`fix-title-update-lock` 放开了 `isTitleBetter` 的锁定策略，却暴露了更深层的 bug：`pendingTitleHint` 在第一次 `extractSessionTitle()` 调用时就被消费（置 null），而 `saveSession` 每次 agent turn 都会被调用多次。后续调用时 hint 已空，Pass 1 反向扫描命中注入的系统指令正文（如 `Enter explore mode. Think deeply. Visualize freely. Follow t…`），加上 `isTitleBetter` 不再锁定，正确的标题在同一个 session 内被反复覆盖为错误值。

## What Changes

- **重命名 `pendingTitleHint` → `titleIntent`**：变量名准确反映语义——不是"临时提示"，而是"用户打开 session 的真实意图"
- **`titleIntent` 不再被 `extractSessionTitle` 消费**：只在 Pass 1 找到真正的非命令人类消息时才清除；多次 `saveSession` 调用之间始终可用
- **调整优先级**：Pass 1（真实人类消息）→ `titleIntent` → Pass 2（command argument）→ Pass 3（兜底）。`titleIntent` 作为比 Pass 2/3 更可靠的信号源
- **`setPendingTitleHint` 重命名为 `setTitleIntent`**：导出函数同步改名

## Capabilities

### Modified Capabilities

- `session-title-extraction`: `extractSessionTitle` 的 hint 持久化策略从"首次消费后清空"改为"仅在 Pass 1 命中真正人类消息时清除"；新增 `titleIntent` 优先级（介于 Pass 1 和 Pass 2 之间）

## Impact

- **代码**: `src/session/manager.ts` — `pendingTitleHint` / `setPendingTitleHint` 重命名 + `extractSessionTitle` 消费策略调整
- **调用方**: `src/ui/tui-app.ts` line 23, 1277; `src/ui/web/web-backend.ts` line 18, 723 — import 和调用改为新名称
- **测试**: 更新 title extraction 测试，覆盖多次 save 场景和 titleIntent 持久化场景
- **行为变更**: session title 不再在多轮 `saveSession` 调用中被注入的系统指令正文覆盖
