## Prototype Files

- `docs/prototypes/fix-transition-incomplete-strike-full-content-cascade.html` — 自包含单文件原型，验证方案 A（全文撞击 + 自动滚动 + 内容落地 + 活泼撞击）。内置 50 项结果清单（复现「交互完成…下面还有数十行」场景），点击「触发 Cascade」后 cluster 用内容坐标逐行撞击全文，自动滚动让每一行进入视口；落地落在每行紧凑文本边界（`Range.getClientRects()`）的中心，撞击时产生字符四散、冲击环、震屏与径向粒子爆发；只有全部行撞完（HUD 显示 `撞击 N / N`、控制台打印 `all rows struck: N/N → gather`）后才整体淡出进入 gather。支持亮/暗主题切换与重置。（apply 完成后已删除）

关键视觉与交互决策（经原型确认）：
- 撞击目标 = 全文所有叶子 `[data-collider]`，用内容坐标（`rect.top - scrollRect.top + scrollTop`）而非视口坐标。
- cluster 稳定在视口约 62% 高度，容器随之下探自动滚动，`overflow: hidden` 锁定用户滚动。
- 落地 = 文本紧凑边界的中心（`cCenterX/cCenterY`），而非整行元素盒。
- 撞击反馈四件套：字符四散（`position: fixed` 屏幕空间，独立 translate/rotate/scale）、accent 冲击环、屏幕震动（指数衰减）、34–80 颗径向粒子。
- 长文本（> 80 字符）退化为粒子爆发而非逐字符四散。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/fix-transition-incomplete-strike-full-content-cascade.html` | `delete` | 单次变更视觉参考原型，实现已完成且 typecheck/tests 通过；不构成可复用的跨功能视觉契约或状态矩阵，长期价值门不通过 |

## Prototype Status

（UI 变更，不适用 stub）
