## Context

当前 TUI 图片管理使用 `[image]` 作为统一 placeholder，所有图片共享相同的文本表示。`ImageManager` 仅提供 LIFO（`add` / `removeLast`）操作，`ConversationView` 的 draft 管理同样基于 LIFO 栈。这导致删除任意位置 placeholder 时，系统无法识别用户意图删除的是哪张图片，始终移除最后一张。

## Goals / Non-Goals

**Goals:**
- 为每张图片分配唯一 ID，生成可区分的 `[image:<id>]` placeholder
- 支持按 ID 精确删除任意位置的图片（不再局限于 LIFO）
- 占位符合法性策略明确：破坏即删除，不搞模糊容错
- onChange 同步逻辑幂等可靠

**Non-Goals:**
- 不改变 Web 端行为
- 不改变图片提交到模型的流程
- 不引入持久化（ID 仅在 session 生命周期内有效）
- 不支持用户手动插入 `[image:<id>]` 创建图片

## Decisions

### Decision 1: 单调递增整数 ID

用 `nextId` 计数器，从 1 开始，每次 `add()` 递增。比 UUID 短，比 hash 直观。

**替代方案**:
- UUID: 太长，在 editor 中污染视觉
- 短 hash: 字符无意义，用户难以区分

### Decision 2: `[image:<id>]` 格式 + 严格匹配

格式: `\[image:(\d+)\]` —— 精确匹配左方括号、固定前缀、冒号、正整数、右方括号。

**任何不匹配此格式的文本均视为"该图片已被删除"**:
- 缺括号、大小写错误、多余空格、非数字 ID 等 → 对应图片移除
- 文本中出现 `[image:99]` 但 images 中无 ID=99 → 忽略（no-op，与当前"手动输入 [image]"行为一致）

**替代方案**:
- 容错匹配（如忽略大小写、允许空格）: 引入模糊性，增加实现复杂度，用户容易困惑

### Decision 3: ImageManager API 改动

```typescript
class ImageManager {
  private images: ImageContent[] = [];
  private nextId = 1;

  add(img: ImageContent): number;        // 返回分配的 id
  removeById(id: number): boolean;       // 按 ID 删除，返回是否成功
  getById(id: number): ImageContent | undefined;
  drain(): ImageContent[];               // 不变
  clear(): void;                         // 不变，同时重置 nextId
  get count(): number;                   // 不变
  get totalBase64Bytes(): number;        // 不变
}
```

**替代方案**:
- 保持 `removeLast()` 同时新增 `removeById()`: 混乱，两个删除路径；统一为 by-id 更清晰
- 用 Map 替代数组: 内部查询 O(1) 但 drain() 需要保持插入顺序，数组即可（图片量小）

### Decision 4: ConversationView draft 管理改为 Map

```typescript
// 当前
private draftImageBlockCounts: number[] = [];

// 改为
private draftImageBlockIds: number[] = [];       // 保持插入顺序
private draftBlockCounts: Map<number, number> = new Map();  // id → blockCount

addDraftImage(id: number, base64Data, mimeType, infoText): void
removeDraftImageById(id: number): void          // 按 ID 移除，O(n) 遍历
```

`removeDraftImageById` 需要在 blocks 数组中找到对应 ID 的区间并移除。由于 draft 追加在 blocks 末尾，它们的区间是连续的——但中间删除会留下空洞。方案：记录每个 ID 在 blocks 中的 `[startIndex, endIndex)` 区间，删除时用 splice 移除对应切片。

**实际上更简单的方案**: 每次 add 记录 `{id, startIndex, count}` 三元组。remove 时找到该三元组，splice blocks 并调整后续 draft 的 startIndex。

但由于 draft 追加在 blocks 末尾，且外部先通过 onChange diff 确定要删的 ID 集合，可以一次性处理多个 drafts。更简单的做法是：**重建**——将所有存活的 drafts 的 blocks 重新追加到末尾。

实际上，考虑到图片量很小（个位数），最简单的实现是：
1. 记录每个 id → {blockCount, startIndex} 
2. removeDraftImageById 遍历找到，splice 对应区间
3. 后续 draft 的 startIndex 减去已移除的 count

### Decision 5: TuiApp.onChange 同步逻辑

```typescript
// 当前
const imageCount = (text.match(/\[image\]/g) || []).length;
while (imagePasteHandler.imageCount > imageCount && !drainedSubmitImages) {
  imagePasteHandler.removeLastImage();
}

// 改为
const RE = /\[image:(\d+)\]/g;
const presentIds = new Set<number>();
for (const m of text.matchAll(RE)) {
  presentIds.add(Number(m[1]));
}
const removedIds = handler.getAllIds().filter(id => !presentIds.has(id));
for (const id of removedIds) {
  handler.removeImageById(id);
}
```

### Decision 6: ImagePasteHandler API 改写

```typescript
class ImagePasteHandler {
  addImage(img: ImageContent): number;       // 返回分配的 id
  removeImageById(id: number): void;         // 替代 removeLastImage
  getAllIds(): number[];                     // 新增，用于 diff
  drainImages(): ImageContent[];             // 不变
  get imageCount(): number;                  // 不变
  clear(): void;                             // 不变
  updateStatus(): void;                      // 不变
}
```

## Risks / Trade-offs

- **风险**: placeholder `[image:<id>]` 中的 `<id>` 在 session 内单调递增不重置，长期使用可能产生较大数字。
  → 缓解: clear() 重置 nextId；ID 仅在 session 内有效，且通常不会超过几十次粘贴

- **风险**: `removeDraftImageById` 在 blocks 中间删除时需要调整后续 draft 的偏移量，实现复杂度高于 LIFO pop。
  → 缓解: 图片量极小（个位数），边界情况有限；充分单元测试覆盖

- **风险**: String.replace 直接移除 placeholder 文本做正则替换时情况较少，此处不用——只需 diff IDs。不存在重新编号 placeholder 的问题。
  → 不需要重新编号，ID 稳定，删除中间一个不影响其他
