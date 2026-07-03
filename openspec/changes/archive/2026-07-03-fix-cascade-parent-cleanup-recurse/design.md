## Problem

```
message-card
├── text-line × N          ← direct children, in rows[]
└── tool-card              ← nested container (has child colliders, skipped in buildRowList)
    ├── tool-header        ← in rows[]
    └── tool-result-line   ← in rows[]
```

`strikeRow()` 中的清理逻辑在 strike 每个 row 后调用 `closest()` 向上查找最近容器。当最后一个 row 在 tool-card 内时：

```
text-line-1 被 strike → closest → message-card → allStruck? NO (还有 tool rows) → 跳过
...
text-line-N 被 strike → closest → message-card → allStruck? NO (还有 tool rows) → 跳过
tool-header 被 strike → closest → tool-card   → allStruck? NO → 跳过
tool-result-line 被 strike → closest → tool-card → allStruck? YES → tool-card 消失 ✓
                             ⚠️ message-card 不再被检查 → 气泡壳残留
```

## Solution

将单次 `closest()` 查找替换为**自底向上构建完整祖先容器栈**，逐层清理：

```
strikeRow():
  1. 正常 destroy 当前 row
  2. 构建 cardStack: 从 row.el 向上收集所有 [data-collider="tool-card"|"message-card"] 祖先
  3. 自底向上遍历 cardStack，对每层：
     a. 检查该层内所有 [data-collider] 后代是否已 strike 或已隐藏
     b. 若全部处理完毕 → 清理该层（spawnParticles + opacity 0 / destroyToolCard）
     c. 继续向上
```

```
                           strike tool-result-line
                                  │
                                  ▼
                    build cardStack: [tool-card, message-card]
                                  │
                          ┌───────┴───────┐
                          ▼               ▼
                    tool-card        message-card
                    allStruck? YES   allStruck? YES
                    → 清理           → 清理 ✓
```

## Key Design Decision: message-card opacity

现有 spec: `destroyMessageCard()` opacity SHALL NOT be changed（假设 message-card 总是纯容器，子元素独立动画）。

在递归清理路径中，message-card 可能作为最终容器被清理。此时设 `opacity: 0` 是正确行为——所有子元素已不可见，无需再保留容器。实现上通过 `spawnParticles + transition opacity 0` 而非 `destroyMessageCard()` 来区分路径。

## Before / After

**Before** (`strikeRow` line 845–860):
```typescript
const parentCard = row.el.closest<HTMLElement>(
  '[data-collider="tool-card"], [data-collider="message-card"]'
);
if (parentCard) {
  const siblings = parentCard.querySelectorAll<HTMLElement>("[data-collider]");
  const allStruck = [...siblings].every(...);
  if (allStruck) {
    spawnParticles(parentCard);
    parentCard.style.transition = "opacity 200ms ease-out";
    parentCard.style.opacity = "0";
  }
}
```

**After**: Extract into `cleanupParents(rowEl)` that walks all ancestor containers:
```typescript
function cleanupParents(el: HTMLElement): void {
  let current = el.parentElement;
  while (current) {
    const type = current.getAttribute("data-collider");
    if (type !== "tool-card" && type !== "message-card") {
      current = current.parentElement;
      continue;
    }
    const children = current.querySelectorAll<HTMLElement>("[data-collider]");
    const allDone = [...children].every((child) => {
      const childRow = s.rows.find((r) => r.el === child);
      if (childRow && !childRow.struck) return false;
      return true;
    });
    if (!allDone) break; // stop: this container still has work
    // cleanup this container
    spawnParticles(current);
    current.style.transition = "opacity 200ms ease-out";
    current.style.opacity = "0";
    current = current.parentElement;
  }
}
```
