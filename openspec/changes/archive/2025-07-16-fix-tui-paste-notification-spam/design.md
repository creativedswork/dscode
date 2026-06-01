## Context

当前 TUI 的大段粘贴流程：

```
Terminal → TUI.handleInput
  ├─ inputListeners: handlePasteImage(data) — 处理图片 paste，纯文本透传
  └─ Editor.handleInput → Editor.handlePaste
       └─ 大文本(>10行或>1000字符) → 插入 "[paste #N +X lines]" → onChange() 触发
```

`onChange` 中的 paste 通知：

```typescript
this.editor.onChange = (text) => {
  const match = text.match(/\[paste #\d+ (\+[\d]+ lines|[\d]+ chars)\]/);
  if (match) {
    this.conversation.addInfo(c.dim(`Large paste accepted — ${match[0]}. ...`));
  }
  // image sync ...
};
```

问题：`onChange` 是每次文本变化的回调，paste 标记一直存在于 text 中直到按 Enter 提交，因此每个后续按键都重复匹配并通知。

## Goals / Non-Goals

**Goals:**
- 大段粘贴通知只在 paste 发生时显示**一次**
- 修复方案遵循事件驱动原则（在 paste 源头处理，而非在 state change 中轮询）

**Non-Goals:**
- 不改变 pi-tui Editor 的 paste 标记机制
- 不影响 image paste 处理流程
- 不改变 paste 标记的视觉呈现或提交行为

## Decisions

### Decision 1: 在 TUI inputListener 中检测大段文本 paste

在 `handlePasteImage` 中，当检测到纯文本 bracketed paste 时，增加大小判断：

```typescript
// handlePasteImage 中，纯文本 paste 分支（当前 return undefined 处）
if (pasteContent.trim() !== "" && !hasControlChars) {
  // 新增：大段文本 paste 通知
  const lines = pasteContent.split("\n");
  const totalChars = pasteContent.length;
  if (lines.length > 10 || totalChars > 1000) {
    const desc = lines.length > 10 
      ? `[paste # +${lines.length} lines]` 
      : `[paste # ${totalChars} chars]`;
    this.conversation.addInfo(c.dim(`Large paste accepted — ${desc}. Press Enter to submit full content.`));
  }
  return undefined; // 继续透传给 Editor
}
```

**Rationale:** TUI inputListener 已经解析 bracketed paste 序列（`\x1b[200~...\x1b[201~`），天然在 paste 事件发生的时刻运行**一次**。无需额外的去重逻辑。

**Alternatives considered:**
- **A. onChange 中加 lastNotifiedPasteId 去重**：治标不治本，在错误的地方打补丁
- **B. 改 pi-tui Editor 加 onPaste 回调**：跨库改造，性价比低

### Decision 2: 从 onChange 中移除 paste 通知，保留 image sync

```typescript
this.editor.onChange = (text) => {
  // 移除 paste marker 正则匹配
  // 保留 image 占位符同步
  const imageCount = (text.match(/\[image\]/g) || []).length;
  while (this.pendingImages.length > imageCount) {
    this.pendingImages.pop();
    this.conversation.removeLastDraftImage();
    this.updateImageStatus();
  }
};
```

**Rationale:** onChange 保持单一职责（image sync），paste 通知不再混杂其中。

### Decision 3: 阈值保持一致

使用与 pi-tui Editor 相同的阈值：`> 10 lines || > 1000 chars`。通知消息格式也保持一致。

## Risks / Trade-offs

- **阈值重复**：[Risk] DSCode 和 pi-tui 各自维护相同的阈值常量 → 低风险，Editor 的阈值是其稳定 API 行为，不会轻易改变
- **通知出现时机**：inputListener 中通知比 Editor 插入标记略早（微秒级），但用户感知无差异
