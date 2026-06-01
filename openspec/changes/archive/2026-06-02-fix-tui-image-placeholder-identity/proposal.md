## Why

TUI 图片粘贴使用统一的 `[image]` placeholder 文本，所有图片的 placeholder 完全相同、无法区分。当用户粘贴多张图片后删除中间的 placeholder，系统一律按 LIFO 移除最后粘贴的图片，导致"删除第一个 placeholder，实际删掉的是最后一张图片"。Web 端不存在此问题（图片以独立 UI 元素存在），但 TUI 端因图片嵌入编辑器文本，需要 identity 机制来建立 placeholder 与图片的正确映射。

## What Changes

- **BREAKING**: `[image]` placeholder 格式改为 `[image:<id>]`，其中 `<id>` 为单调递增的整数 ID
- ImageManager 从纯 LIFO（`removeLast`）扩展为按 ID 增删查（`add` 返回 id、新增 `removeById`）
- ConversationView 的 draft image 管理从 LIFO 栈改为 `Map<id, blockCount>`，支持按 ID 移除任意位置的 draft
- TuiApp.onChange 同步逻辑从"计数匹配 → LIFO pop"改为"正则提取 ID 集合 → 集合差集 → 按 ID 精确删除"
- 合法格式 `[image:<正整数>]` 保持不变；任何不符合该格式的变体均视为该图片的删除意图
- Web 端不受影响（图片不在文本中）

## Capabilities

### New Capabilities

- `tui-image-placeholder-identity`: ImageManager 为每张图片分配唯一 ID，ImagePasteHandler 生成带 ID 的 placeholder，ConversationView 支持按 ID 移除 draft，TuiApp 通过 ID 集合 diff 实现精确同步

### Modified Capabilities

- `tui-draft-image-sync`: placeholder 格式从 `[image]` 改为 `[image:<id>]`，删除同步从 LIFO 计数改为 ID 集合 diff，ConversationView 的 draft 存储从 LIFO 栈改为 Map

## Impact

- `src/ui/image-manager.ts` — 新增 `add` 返回 id，新增 `removeById(id)`、`getById(id)`
- `src/ui/image-paste-handler.ts` — PLACEHOLDER 模板改为 `[image:${id}]`
- `src/ui/conversation.ts` — `draftImageBlockCounts: number[]` → `Map<number, number>`，`removeLastDraftImage()` → `removeDraftImageById(id)`
- `src/ui/tui-app.ts` — onChange 同步逻辑重写：`match(/\[image\]/g).length` → `[...text.matchAll(/\[image:(\d+)\]/g)]` + ID 集合 diff
- `openspec/specs/tui-draft-image-sync/spec.md` — 需求重写（delta spec）
