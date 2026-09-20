## 1. 动画类型与选行逻辑

- [x] 1.1 在 `web/src/animation/types.ts` 为行类型增加紧凑文本边界字段（`contentTop`/`contentBottom`/`contentLeft`/`contentRight` 或等效中心点），并确认 `ImpactRing` 与 `shake` 相关类型可用。
- [x] 1.2 修改 `web/src/animation/cascade.ts` 的 `selectNextCascadeRowIndex()`：去掉 `top < canvasHeight` 视口裁剪，改为返回全列表最上方未撞行，仅在无未撞行时返回 `-1`。
- [x] 1.3 更新 `tests/ui/transition-collider.test.ts` 中依赖旧视口裁剪语义的用例（如 "includes partially visible rows and excludes fully off-screen rows"、"eventually selects every visible collider..."）以匹配全文选行语义。

## 2. 全文收集 + 内容坐标

- [x] 2.1 `buildRowList()` 改为内容坐标收集：`top = rect.top - scrollRect.top + scrollTop`，移除 `top >= H || bottom <= 0` 与 `scrollContainer` 可见矩形裁剪。
- [x] 2.2 新增 `getContentBounds(el)`（`Range.selectNodeContents()` + `getClientRects()`），并把紧凑文本边界与中心写入每一行（fallback 到元素盒）。

## 3. 自动滚动

- [x] 3.1 新增 `autoScroll()`：每帧把 `scrollTop` 向 `clamp(cluster.y - H * 0.62, 0, maxScroll)` 平滑逼近，并在 cascade 循环内调用；确认动画期间 `overflow: hidden` 已锁定用户滚动。

## 4. 落地与撞击反馈

- [x] 4.1 落地坐标改用文本中心：`landingX()` / `landingY()` 返回紧凑边界中心（fallback 元素盒中心），更新 `drop` 与 `launchHop()` 的目标 X/Y。
- [x] 4.2 增强 `spawnImpact()`：径向粒子爆发（34–80 颗，按行宽自适应）、accent 冲击环、震屏强度叠加。
- [x] 4.3 实现文本行字符四散（屏幕空间 `position: fixed` 悬浮层，逐字符独立 `translate/rotate/scale`；`textContent.length > 80` 退化为粒子爆发）。
- [x] 4.4 在 draw 循环接入 shake 平移与 `drawRings()` 渲染，并在 update 中衰减 shake、清理过期冲击环。

## 5. cleanupParents 修复

- [x] 5.1 修复 `cleanupParents()`：父卡销毁判定改为「卡内所有子 collider 都在 `s.rows` 中且均已 `struck`」，不再把不在 `s.rows` 的子项当作已处理。

## 6. 验证

- [x] 6.1 `npm run typecheck` 通过。
- [x] 6.2 `npm test`（或 UI 相关测试）通过，含更新后的 `tests/ui/transition-collider.test.ts`。
- [x] 6.3 浏览器对照 `docs/prototypes/fix-transition-incomplete-strike-full-content-cascade.html` 验证：全文撞击到 `N / N`、自动滚动、落地在文字上、字符四散/冲击环/震屏、亮暗主题正常；控制台打印 `all rows struck: N/N → gather`。
