# Chat → Dashboard View Transition — 技术方案文档

## 目录

1. [概述](#1-概述)
2. [架构设计](#2-架构设计)
3. [状态机与流程](#3-状态机与流程)
4. [动画管线](#4-动画管线)
   4.2 [布局冻结机制](#42-布局冻结机制)
5. [粒子系统设计](#5-粒子系统设计)
6. [Hop-Step 集群系统](#6-hop-step-集群系统)
7. [DOM 摧毁效果矩阵](#7-dom-摧毁效果矩阵)
8. [渲染管线](#8-渲染管线)
9. [CSS / 主题协同](#9-css--主题协同)
10. [性能与约束](#10-性能与约束)
11. [边界情况与容错](#11-边界情况与容错)
12. [扩展指南](#12-扩展指南)


### 6.4 Hop Arc 视口约束

Hop 弧线公式：`c.y = lerp(startY, endY, t) - peakHeight × sin(t·π)`，其中 `peakHeight = min(rawPeak, max(0, midY))`，`rawPeak = max(40, gap × 0.55)`，`midY = (startY + endY) / 2`。

**关键约束**：`peakHeight ≤ midY`。当 hop 的起点和终点靠近视口顶部时（如 row `top` ≈ 20~60px），若无约束，硬编码的 40px 最小 peak 会将弧线推至 `c.y < 0`（视口外不可见区域）。约束后确保弧线峰值 `c.y ≥ 0`，cluster 始终在可视范围内。对于视口中部的正常 hop（midY ≫ 40），行为不变。

---

## 1. 概述

Chat → Dashboard 过渡动效是 DSCode Web UI 在用户从"对话视图"切换到"仪表盘视图"时播放的全屏 Canvas 动画。其设计目标是：

- **叙事性**：通过一个"射击集群"（hop-step cluster，逐行击碎 UI 元素）→ "粒子汇聚"（gather，向屏幕中央的目标点凝聚）→ "成型保持"（formed，等待 Dashboard artifact 就绪）的三阶段动画，表达"解构 → 重组"的语义。
- **技术性**：完全基于 Canvas 2D 实现，DOM 层作为"碰撞源"提供位置信息和摧毁目标，Canvas 负责粒子/碎片/光环的每帧绘制。
- **无障碍**：支持 `prefers-reduced-motion` 和 ESC 快速跳过。

---

## 2. 架构设计

### 2.1 组件层级

```
App (状态持有者)
├── TransitionCanvas      ← Canvas 覆盖层（z-index: 50），phase=animating 时渲染
├── ArtifactContainer     ← Dashboard artifact 内容（iframe）
├── ChatView              ← 对话视图（scrollLocked 时冻结滚动）
│   └── [data-collider]   ← 标记为可摧毁的 DOM 元素（message-card, text-line, code-line…）
└── MessageInput           ← 输入区域（始终可见）
```

### 2.2 核心参与者

| 角色 | 文件 | 职责 |
|------|------|------|
| `App` (State Machine) | `components/App.tsx` | 持有 `viewMode` / `transitionPhase` / `artifactLoading` 状态，驱动 UI 切换 |
| `TransitionCanvas` | `components/TransitionCanvas.tsx` | 全屏 Canvas 动画引擎：粒子系统、集群跳跃、DOM 摧毁、渲染循环。接收 `scrollContainerRef` prop 用于精确锁定 ChatView 滚动容器 |
| `ArtifactContainer` | `components/ArtifactContainer.tsx` | 在 iframe 中渲染 Dashboard HTML artifact |
| `ChatView` | `components/ChatView.tsx` | 对话列表，通过 `data-collider` 标记每行的定位信息 |
| `ViewModeSwitcher` | `components/ViewModeSwitcher.tsx` | 触发模式切换的 UI 控件（下拉选择） |

### 2.3 数据流

```
用户点击 ViewModeSwitcher "Dashboard"
  │
  ▼
App.handleViewModeChange("dashboard")
  │
  ├─[缓存命中?]──────────────────────────► setViewMode("dashboard")  直接切换，无动画
  │
  ├─[prefers-reduced-motion?]───────────► setViewMode("dashboard")  跳过动画
  │
  └─[正常路径]
       ├─ setArtifactHtml("")           清空旧 artifact
       ├─ setArtifactLoading(true)      后台开始生成
       ├─ send({ type: "artifact", ... }) 请求后端生成 dashboard HTML
       └─ setTransitionPhase("animating") ► TransitionCanvas 挂载
            │
            ▼
       TransitionCanvas useEffect()
            │
            ├─ 读取 DOM [data-collider] 元素 → 构建 rows[]（仅可视区域）
            ├─ hideOffscreenColliders() → 将 viewport 外的 [data-collider] 设为 opacity:0
            ├─ 初始化 cluster（屏幕顶部外）
            ├─ 锁定 ChatView 滚动容器（ref-based + ancestor fallback）
            ├─ 启动 rAF 循环
            │
            ├─ Phase 1: CASCADE
            │    cluster 逐行下跳 → squash/stretch → strikeRow() → 摧毁 DOM
            │
            ├─ Phase 2: GATHER
            │    粒子从底部/屏幕外飞入 → 汇聚到 "DSCode" 文字点阵
            │
            └─ Phase 3: FORMED
                 粒子保持成型 → water ripple 微动 → 等待 artifactReady
                 artifactReady && formedTime > 600ms → onComplete()
                      │
                      ▼
                 handleTransitionComplete()
                      │
                      ├─ 轮询 artifactLoadingRef === false
                      └─ setTransitionPhase("idle") + setViewMode("dashboard")
```

---

## 3. 状态机与流程

### 3.1 App 层状态

```
viewMode ∈ { "chat", "dashboard" }
transitionPhase ∈ { "idle", "animating" }
artifactLoading : boolean
artifactHtml : string
```

### 3.2 动画内部状态

```typescript
type Phase = "cascade" | "gather" | "formed";

interface AnimationState {
  phase: Phase;           // 当前动画阶段
  phaseTime: number;      // 当前阶段已运行毫秒数
  colors: ThemeColors;    // 从 CSS 变量提取的主题色
  particles: Particle[];  // ≤ MAX_PARTICLES (2500)
  impactRings: ImpactRing[];
  shards: Shard[];
  shake: number;          // 屏幕震动偏移量
  formedTime: number;
  targetPoints: {x,y}[];  // "DSCode" 文字光栅化的目标点
  particlesAssigned: number;
  gatherStarted: boolean;
  W: number; H: number;   // Canvas 逻辑尺寸
  cluster: ClusterState;  // hop-step 集群状态
  rows: CascadeRow[];     // 从 DOM 读取的可摧毁行列表
  scaleX: number; scaleY: number;  // 集群缩放（squash/stretch）
  breathPhase: number;    // dwell 期间呼吸动画相位
  letterColorMap: Record<string, string>;  // 每字母颜色
}
```

### 3.3 Cluster 子状态机

```
drop → squash → stretch → dwell → hopping → squash → … → (all rows struck) → gather
        80ms      60ms      300ms     variable
```

**Hop-step 生命周期（per row）：**

| 状态 | 持续时间 | 行为 |
|------|---------|------|
| `drop` | 动态（直到到达第一行 Y 坐标） | cluster 从屏幕顶部外垂直下落 |
| `squash` | 80ms | scaleY: 1.0→0.6, scaleX: 1.0→1.3，模拟撞击形变 |
| `stretch` | 60ms | scaleY: 0.6→1.2, scaleX: 1.3→0.85，弹性回弹 |
| `dwell` | 300ms | 微小呼吸动画（scale 1.0±0.02），等待读感 |
| `hopping` | 350-800ms（√gap×25） | 正弦弧线跳跃到下一行 |

---

## 4. 动画管线

### 4.1 完整时序图

```
t=0          t=~0.8s     t=~3-8s       t=+0.6s
  │              │           │              │
  ▼              ▼           ▼              ▼
┌──────┐    ┌─────────┐ ┌──────────┐  ┌──────────┐
│CASCADE│───►│ GATHER  │►│ FORMED   │─►│onComplete│
│       │    │         │ │(water    │  │callback  │
│cluster│    │particles│ │ ripple)  │  │          │
│hops   │    │converge │ │          │  │          │
└──────┘    └─────────┘ └──────────┘  └──────────┘
   │                            │
   │  每 hop 触发:               │  等待条件:
   │  strikeRow()                │  artifactReady=true
   │  destroyByType()            │  && formedTime > 600ms
   │  spawnParticles()           │
   │  spawnImpactFragments()     │
```

1. **初始化**：`firstFrame()` 中依次调用 `buildRowList()` 扫描可视 `[data-collider]` 构建 rows 数组，`hideOffscreenColliders()` 将视口外元素设为 `opacity:0` 防止内容塌陷时浮入

2. **逐行下跳**：cluster 从 `(W/2, -random(60,140))` 开始下落
3. **撞击行时**：`strikeRow()` 先锁定行高（`height` = 快照值 + `box-sizing: border-box`，inline 元素额外设置 `display: inline-block`）以防止 DOM 突变破坏页面布局 → 然后调用 `destroyByType(el, impactX, impactY)` 触发摧毁效果
4. **行被标记 struck=true**，触发对应摧毁效果
5. **所有行处理完毕或 ESC 跳过** → `startGather()`

### 4.2 布局冻结机制

Cascade 阶段每行被 cluster 撞击时，`strikeRow()` 在调用 `destroyByType()` **之前**先冻结元素的全部盒模型属性，确保 DOM 摧毁效果（如 `innerHTML` 替换）不会改变元素在文档流中的贡献空间：

- **快照高度锁定**：使用 `buildRowList()` 捕获的 `row.height`（`getBoundingClientRect().height` 快照值），设置 `el.style.height = row.height + "px"`
- **盒模型修正**：`el.style.boxSizing = "border-box"` 使显式 height 与快照视觉高度一致
- **Inline 元素兼容**：对 `display: inline` 的元素设置 `display: inline-block`，使其接受 height 锁定（纯 inline 元素忽略 height 属性）
- **Margin/Padding 冻结**：额外冻结 `marginTop`、`marginBottom`、`paddingTop`、`paddingBottom`、`lineHeight`，防止 DOM 突变导致这些属性隐式变化
- **不裁剪**：不使用 `overflow: hidden`，保证 scatter 动画的 `transform: translate()` 飞出效果不被裁切
- **按需锁定**：仅被 cluster 实际撞击的行才锁定，ESC 跳过时未撞击行不受影响

#### 4.2.1 位置重新校准（Position Recalibration）

即使冻结了盒模型属性，DOM 摧毁（尤其是 `destroyTextLine` / `destroyToolHeader` 中的 `innerHTML` 替换）仍可能因以下原因导致所有行（包括已撞击行）位置漂移：

- **非法 HTML 嵌套**：`<span data-collider="text-line">` 内包含 `<Markdown>` 组件，后者渲染为 `<div>`。浏览器对 block-in-inline 嵌套实施 anonymous block-box 拆分，`innerHTML` 替换后拆分结构变化，即使 height 锁定仍可能产生微小布局偏移
- **Flex/Grid 容器重排**：`destroyToolHeader` 清除 flex 容器内容后追加 inline-block span，flex 上下文丢失可能导致父容器重新分配空间
- **上游内容塌陷**：已撞击行上方的 DOM 元素（如 message-card padding、thinking block 折叠等）可能因相邻 DOM 突变而产生整体位移

**解决方案**：每次 `strikeRow()` 完成后，立即：
1. 重新测量**当前撞击行**的 `getBoundingClientRect()`，更新 `row.top` 并同步 cluster 的 `c.y`，确保 cluster 视觉上始终锁定在撞击元素上
2. 重新测量所有**未撞击行**的 `getBoundingClientRect()`，更新其 `top`/`left`/`width`/`height`
3. 若 cluster 正在 hop 途中（`hopState === "hopping"`），同步更新 `hopEndY`/`hopEndX` 为目标行的最新位置

此三重机制（盒模型冻结 + 撞击行位置同步 + 未撞击行重校准）确保 cascade 阶段的碰撞位置始终准确，cluster 不会漂移到不可见区域。

### 4.3 Phase 2: GATHER（粒子汇聚）

1. **生成目标点阵**：`renderTargets()` 在 offscreen canvas 上用 `700px "Geist"` 渲染 "DSCode"，采样像素得到 targetPoints[]
2. **粒子分配**：`particlesAssigned` 指针将已有粒子（从 cascade 遗留）和新生成的粒子分配到目标点
3. **每帧物理**：粒子被目标点引力 (force=0.55) 吸引，到达阈值(dist<4px) 后标记 `phase: "formed"`，触发闪光+冲击环+震动
4. **安全超时**：5 秒后强制进入 formed

### 4.4 Phase 3: FORMED（成型保持）

- 所有粒子保持位置，`flash` 值指数衰减
- 如果 artifact 未就绪，粒子产生 **water ripple 微动**（正弦波偏移，幅度 2.5px）
- 一旦 `artifactReadyRef.current === true` 且 `formedTime > 600ms`，调用 `onComplete()`
- 安全超时：5 秒后强制完成

---

## 5. 粒子系统设计

### 5.1 粒子数据结构

```typescript
interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  phase: "fall" | "gather" | "formed";
  tx?: number; ty?: number;           // 目标坐标（gather 阶段）
  gatherDelay?: number;               // 汇聚延迟（避免同步到达）
  flash?: number;                     // 成型瞬间高亮（指数衰减）
  life?: number;                      // 生命周期（ms，仅 fall 阶段）
}
```

### 5.2 粒子物理模型

| 阶段 | 规则 |
|------|------|
| `fall`（cascade） | vy += 0.28·dtFactor; vx *= 0.995; 无地板反弹，超出底部即移除 |
| `fall`（gather 补粒子） | 同上，但 y >= H-4 时反弹 vy *= -0.3 |
| `gather` | 引力: vx += (dx/dist)·0.55; vy += (dy/dist)·0.55; 阻尼 0.88 |
| `formed` | flash *= 0.92; 若 artifact not ready: 正弦波 offset |

### 5.3 粒子生成策略

| 场景 | 数量 | 颜色 | 来源 |
|------|------|------|------|
| `destroyTextLine`（短文本） | 字符级 scatter（CSS 动画），不生成粒子 | — | CSS keyframes |
| `destroyTextLine`（长文本 >80chars） | 30-50 | warmColors 随机 | `spawnParticles()` |
| `destroyToolCard` | 40-70 | accent + warmPurple | `destroyToolCard()` |
| `destroyMessageCard` | 4-6 shards | textMuted | `destroyMessageCard()` |
| 每 hop 撞击 | 6×char | letterColorMap[char] | `spawnImpactFragments()` |
| gather 补充 | ≤50/帧，直到填满 targetPoints | text 色 | `updateGather()` |

### 5.4 碎片（Shard）系统

```typescript
interface Shard {
  x: number; y: number;
  vx: number; vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  life: number;             // 500ms
  points: {x,y}[];          // 随机多边形顶点
}
```

碎片仅在 `destroyMessageCard` 中生成，从卡片中心区域随机位置爆出 4-6 块多边形，受重力（vy += 0.15·dtFactor），生命 500ms。

---

## 6. Hop-Step 集群系统

### 6.1 设计意图

"dscode" 6 个字母作为一个整体集群在屏幕上跳跃，每次落在一个 `[data-collider]` 行上触发摧毁。六个字母各有独立颜色（accent / warm purple / yellow / text / teal），共 6 组偏移量：

```typescript
const CLUSTER_OFFSETS = [
  { char: "d", ox: -40, oy: 0 },
  { char: "s", ox: -24, oy: 0 },
  { char: "c", ox: -8,  oy: 0 },
  { char: "o", ox: +8,  oy: 0 },
  { char: "d", ox: +24, oy: 0 },
  { char: "e", ox: +40, oy: 0 },
];
```

### 6.2 Landing X 约束

1. 若行宽 ≥ CLUSTER_WIDTH(70px)，在 `[left + 40, left + width - 40]` 随机
2. 否则取行中点
3. 连续两行的 `landingX` 差距至少 CLUSTER_WIDTH × 0.3（被强制重新随机最多 5 次）

### 6.3 视觉变形

绘制时使用 `ctx.translate(originX, cy) → ctx.scale(sx, sy) → ctx.translate(-originX, -cy)` 实现以碰撞脚点为原点的缩放变形。

---

## 7. DOM 摧毁效果矩阵

| `data-collider` 类型 | 摧毁方法 | 视觉效果 | 粒子/碎片？ |
|----------------------|---------|---------|------------|
| `text-line` | `destroyTextLine()` | 逐字符 scatter（CSS keyframes，-60~60px scatter） | 仅长文本 spawnParticles |
| `code-line` | `destroyCodeLine()` | 逐帧"腐败"→ ▓ 替换 → 抖动 → fade out | 否 |
| `tool-header` | `destroyToolHeader()` | 逐字符 scatter（-50~50px） | 否 |
| `tool-result-line` | `destroyToolResultLine()` | 逐字符 scatter（-40~40px，更 subtle） | 仅长文本 spawnParticles |
| `tool-card` | `destroyToolCard()` | clip-path circle 收缩 + 40-70 粒子爆出 | 是（40-70） |
| `message-card` | `destroyMessageCard()` | 短暂白色 flash + 4-6 shards（不改变 opacity） | 是（shards） |

**父容器级联清理**：当一个 `tool-card` 或 `message-card` 内所有子 `[data-collider]` 都已 struck，自动 spawnParticles 并 opacity→0。

**布局冻结**：所有摧毁方法在 `strikeRow()` 中被调用之前，元素的高度已被锁定（`height` + `box-sizing: border-box`，详见 §4.2）。这确保 DOM 突变（`innerHTML` 替换等）不会改变元素在文档流中的贡献空间，防止下游行位置漂移。尤其对于 `tool-header`（flex 容器，`innerHTML` 替换为 scatter span 后 flex 上下文丢失、高度变化最大），高度锁定是消除级联布局偏移的关键。

---

## 8. 渲染管线

### 8.1 Canvas 初始化

- **DPR 上限**：`Math.min(devicePixelRatio, 2)`
- **尺寸**：从父容器 `clientWidth/Height` 读取，首个 rAF 中延迟设置以避免 0×0 竞态
- **背景**：`transparent`，UI 透过 Canvas 可见

### 8.2 每帧绘制顺序

```
1. ctx.clearRect(0, 0, W, H)
2. ctx.save()
3. [shake 震动]   ctx.translate(rand(-shake, shake), rand(-shake, shake))
4. drawFormedGlow(now)    ← 仅在 formed 阶段，径向渐变呼吸辉光
5. drawCluster()          ← 仅在 cascade 阶段，6 字母集群
6. drawParticles()        ← 所有阶段的粒子
7. drawRings()            ← 冲击环（半透明白色圆弧）
8. drawShards()           ← 多边形碎片
9. ctx.restore()
10. drawHUD()             ← 右下角状态标签（等宽字体 tech label）
```

### 8.3 绘制技术细节

- **Formed glow**：`globalCompositeOperation = "lighter"` 混合模式，径向渐变中心为 accent 色
- **Particle flash**：形成瞬间同样使用 `lighter` 混合，`flash > 0.3` 阈值
- **Rings**：纯白 stroke，life 线性衰减透明度
- **HUD label**：11px Geist Mono，右下角，textMuted 色

---

## 9. CSS / 主题协同

### 9.1 主题色提取

动画启动时从 `:root` / `.dark` 读取 CSS 自定义属性：

```typescript
const accentHex = getComputedStyle(documentElement)
  .getPropertyValue("--color-accent").trim();
const text = getComputedStyle(documentElement)
  .getPropertyValue("--color-text").trim();
const textMuted = getComputedStyle(documentElement)
  .getPropertyValue("--color-text-muted").trim();
```

主题色自动从 accent 计算 hue，派生 `warmPurple = hsl(hue+55, 55%, 52%)`。

### 9.2 `data-collider` 标记

ChatView 及相关子组件中的 DOM 元素通过 `data-collider` 属性标记为可被动画"打击"：

| 属性值 | 来源组件 | 描述 |
|--------|---------|------|
| `message-card` | `ChatView.tsx` → `MessageBubble` | 用户/助手消息卡片（外层容器） |
| `text-line` | `Markdown.tsx` | 渲染的文本段落 |
| `code-line` | `Markdown.tsx` | 代码块行 |
| `tool-card` | `ToolCard.tsx` | 工具调用卡片容器 |
| `tool-header` | `ToolCard.tsx` | 工具名/状态头 |
| `tool-result-line` | `ToolCard.tsx` | 工具结果文本行 |

**嵌套过滤规则**：`buildRowList()` 跳过包含子 `[data-collider]` 的元素，只保留叶子节点。

### 9.3 滚动锁定

动画期间有两层滚动锁定：

**Layer 1 — CSS class（ChatView）**：`scrollLocked` prop → `overflow-hidden pointer-events-none`，阻止用户交互。

**Layer 2 — Programmatic（TransitionCanvas）**：通过 `scrollContainerRef` prop 接收 ChatView 的滚动容器引用，动画开始时保存 `scrollTop` 并设置 `overflow: hidden`，cleanup 时恢复。若 ref 为 null，fallback 到祖先遍历查找。

```typescript
// TransitionCanvas — ref 优先 + 祖先遍历 fallback
const sc = scrollContainerRef?.current ?? findScrollAncestor();
const scrollContainer = sc;
if (scrollContainer) {
  prevScrollTop = scrollContainer.scrollTop;
  prevOverflow = scrollContainer.style.overflow;
  scrollContainer.style.overflow = "hidden";
}
```

---

## 10. 性能与约束
- **Offscreen canvas**：光栅化 "DSCode" 文字避免每帧测量
- **CSS animation**（text-line / code-line / tool-header / tool-result-line）：利用 GPU 合成层，不占用 Canvas fill 开销
- **粒子过滤**：每帧 filter 移除 out-of-life 粒子，避免数组膨胀
- **早停**：ESC 键在 cascade 阶段直接 `startGather()` 跳过剩余行

---

## 11. 边界情况与容错

### 11.1 Reduced Motion

```typescript
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  onCompleteRef.current();  // TransitionCanvas
  setViewMode("dashboard"); // App
  return;
}
```

动画完全跳过，直接切换到 dashboard。

### 11.2 Dashboard 缓存

```typescript
// App.tsx: handleViewModeChange
if (cached && cached.contentHash === sessionHash) {
  setArtifactHtml(cached.html);
  setViewMode("dashboard");
  return; // 无动画
}
```

同一个 session 的 artifact 按 `contentHash` 缓存到 `localStorage`（`dscode-dash-cache`），命中时直接渲染，不触发动画。

### 11.3 Empty / No rows

如果 ChatView 为空（无消息），`buildRowList()` 返回空数组，`updateCascade()` 在 2 秒后自动 `startGather()`。

### 11.4 0×0 Canvas

`firstFrame()` 在 `W===0 || H===0` 时递归 `requestAnimationFrame` 等待容器就绪。

### 11.5 多行连续 X 约束

连续两行 `landingX` 差距 < `CLUSTER_WIDTH*0.3` 时强制重新随机（最多 5 次）以避免视觉重复。

### 11.6 行可见性过滤

`buildRowList()` 中仅收集当前 Canvas viewport 内可见的 `[data-collider]` 叶子元素作为 cluster hop 的目标行：
- 跳过 `top >= H || bottom <= 0`（完全在 Canvas 外）
- 跳过父可滚动容器裁剪区域外的行

**Off-screen 元素处理**：`hideOffscreenColliders()` 在 `buildRowList()` 之后立即运行，对所有 viewport 外的叶子 `[data-collider]` 设置 `opacity: 0; transition: none`。这些元素不在 `rows[]` 中，cluster 不会跳跃到它们。自 `cascade-freeze-layout` 引入布局冻结（§4.2）之后，内容塌陷的根因已被消除，此项降级为冗余安全网。

### 11.7 Off-screen Ghost 元素

动画期间，可视区内被摧毁的 DOM 元素可能因 `innerHTML` 替换导致高度变化，使得原本在 viewport 下方的 `[data-collider]` 元素向上浮入可视区。**主要防线**：`strikeRow()` 在调用 `destroyByType()` 之前锁定每行高度（§4.2），从根因上消除布局漂移。`hideOffscreenColliders()` 作为冗余安全网在动画启动时隐藏 off-screen 元素。

### 11.8 光标

动画期间 `document.body.style.cursor = "none"` 隐藏鼠标，cleanup 时恢复。

---

## 12. 扩展指南

### 12.1 添加新的摧毁效果类型

1. 在 ChatView/ToolCard 中需要参与动画的元素添加 `data-collider="new-type"`
2. 在 `destroyByType()` 的 switch 中添加 case
3. 实现对应的 `destroyNewType(el, impactX, impactY)` 方法
4. 处理嵌套容器逻辑（如该类型是叶子节点还是容器）

### 12.2 修改集群行为

常量在文件顶部：
- `CLUSTER_OFFSETS`：字母偏移（支持更多/更少字母）
- `SQUASH_MS` / `STRETCH_MS` / `DWELL_MS`：各状态持续时间
- `DROP_SPEED`：下落速度
- `CLUSTER_SIZE`：字母字号

### 12.3 修改颜色映射

在 `letterColorMap` 中按字符分配颜色，可用 hex/hsl 任意格式。

### 12.4 添加新动画阶段

1. 扩展 `Phase` 类型
2. 在 `frame()` 中添加 case
3. 实现 `updateNewPhase(dt, dtFactor)` 和对应的 `draw` 方法
4. 确保阶段转换条件明确且有安全超时

### 12.5 反向过渡（Dashboard → Chat）

当前不存在反向动画。若要实现，可复用 `TransitionCanvas`，将 `rows` 从 dashboard 中获取（需 dashboard 提供 `data-collider`），或使用纯粒子动画实现"爆炸 → 重构为 chat UI"的效果。

| `web/src/components/TransitionCanvas.tsx` | ~1249 | 动画引擎主体 |

## 附录 A: 关键文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| `web/src/components/TransitionCanvas.tsx` | ~1217 | 动画引擎主体 |
| `web/src/components/App.tsx` | ~329 | 状态机 + 过渡触发 |
| `web/src/components/ChatView.tsx` | ~139+ | data-collider 来源 |
| `web/src/components/ArtifactContainer.tsx` | ~72 | Dashboard 渲染容器 |
| `web/src/components/ViewModeSwitcher.tsx` | ~32 | 视图切换控件 |
| `web/src/animation/types.ts` | ~36 | Particle / ImpactRing / Shard 类型 |
| `web/src/animation/extractColliders.ts` | ~4 | 已废弃（保留引用） |
| `web/src/index.css` | ~258 | 主题变量 + CSS 动画 |

## 附录 B: 动画时间预算

| 阶段 | 最小时长 | 典型时长 | 最大时长 |
|------|---------|---------|---------|
| Cascade (n rows) | n×(80+60+300+350) ≈ 0.8s×n | — | ESC 跳过 |
| Gather | ~0.8s | ~2s | 5s 超时 |
| Formed | 0.6s | ~1-3s（等待 artifact） | 5s 超时 |
| **总计** | **~1.5-3s** | **~5-8s** | **~12s（最坏）** |
