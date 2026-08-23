## Prototype Files

- `docs/prototypes/archive/2026-08-24-fix-cascade-coordinate-mismatch/fix-cascade-coordinate-mismatch-full-content-cascade.html` — 自包含单文件参考原型，验证「全文撞击 + 自动滚动 + 文字紧致边界落地 + 坐标对齐 + 活泼撞击」的完整契约。内置 60+ 行聊天内容（含 thinking / tool / code / result-list），点击「触发 Cascade」后 cluster 用滚动容器内容坐标逐行撞击全文；落地落在每行紧凑文本边界（`Range.getClientRects()`）的中心；撞击时产生字符四散（`position: fixed` 屏幕空间）、accent 冲击环、震屏与径向粒子爆发；只有全部行撞完（HUD 撞击 N/N、console `all rows struck: N/N → gather`）才整体淡出进入 gather。支持亮/暗主题切换与重置。已通过 headless Chrome 冒烟验证（rows=66、撞击逐行发生、无 JS 报错）。
- Open Design 项目 `dscode-cascade-content-attractor-20260823` / `chat-dashboard-transition.html` — 针对本轮反馈生成的可重放动画参考，验证空白行跳过、同行单次命中、外壳跟随内容消失，以及长卡片 3 次命中后沿单侧弧线向核心收缩并化为少量星尘。预览：`http://127.0.0.1:7456/api/projects/dscode-cascade-content-attractor-20260823/raw/chat-dashboard-transition.html`。

关键视觉与交互决策（经原型确认）：
- 撞击目标 = 全文所有叶子 `[data-collider]`，行位置用滚动容器内容坐标 `top = rect.top - scrollRect.top + scrollTop`。
- cluster 绘制用 `vy = c.y - scrollTop`，在「canvas 原点 == 滚动容器原点」的布局下与撞击点严格对齐（本 bug 修复的基准）。
- 落地 = 文本紧致边界中心（`cCenterX / cCenterY`），而非整行元素盒。
- 撞击反馈四件套：字符四散、accent 冲击环、屏幕震动（指数衰减）、34–80 颗径向粒子；长文本（>80 字符）退化为粒子爆发。
- 本轮调整后的节奏：少于 8 条有效视觉行保持逐行命中；达到 8 条时直接命中 3 次，随后用约 480ms 完成向心收束；吸入过程使用现有主题色与透明 Canvas，不使用霓虹、渐变背景或夸张爆炸。
- 空白 Text node 和嵌套滚动区中不可见的 fragment 不产生任何视觉反馈；卡片外壳在内容计数归零时同步淡出或内缩。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-24-fix-cascade-coordinate-mismatch/fix-cascade-coordinate-mismatch-full-content-cascade.html` | `archive` | 长期价值：作为 cascade「全文撞击 + 坐标对齐」的可执行视觉/坐标契约与验收标准（66 行、逐行撞击、all rows struck → gather），可供后续视觉回归与设计评审直接运行。有效性：与最终实现（统一 content-space 坐标 + 显式 origin 偏移）及当前 design tokens 一致，已通过 headless Chrome 冒烟验证，未被更新版本替代，明确归属本 change。 |

Open Design 的 `chat-dashboard-transition.html` 作为本轮实现参考保留在 Open Design 项目中，不复制进仓库，因此不进入 prototype archive/delete 表。

## Prototype Status

（UI 变更，不适用 stub）

## Browser Validation

- 真实会话：66 条消息、1362 个 DOM collider，拆分后得到 1485 个视觉行目标。
- 初始滚动：`scrollTop 18324 → 0`，首行内容坐标 `top=51`。
- 同一长段落逐行裁剪：`clip-path` 顶边连续推进 `21 → 44 → 69px`，最后一行完成前元素保持可见。
- 前四次采样的 cluster 中心与目标行中心：X 误差不超过 `0.8px`，Y 误差为 `2.1–9px`（位于 22px 字形接触范围内）。
- artifact 流式更新期间 collider DOM 保持连接，亮/暗主题 token 均正确，无运行时异常。
- 本轮真实会话包含 1427 个 DOM collider，其中 94 个空内容 collider；亮暗两轮完整转场中空内容样式变更均为 0。
- 长代码框直接裁剪 3 次后进入 480ms 吸入；中途采样的已清空内容容器残留数为 0，完整转场记录到 84 个唯一外壳完成隐藏。
- 亮色使用 `--color-bg: #f8f7f5`；暗色使用 `--color-bg: #1e1c19`、`--color-surface: #282622`。两轮 Canvas 均正常卸载，浏览器控制台无异常。
