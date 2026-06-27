## Context

当前 `turn:end` 事件的 `usage` 字段是简化结构 `{inputTokens, outputTokens}`，而 `AssistantMessage.usage` 是完整的 pi-ai `Usage` 类型（含 input, output, cacheRead, cacheWrite, totalTokens, cost）。TUI 的 `finishAssistantMessage()` 在渲染后会追加 `⏱ total wait` dim 行——token/cost/上下文占比信息天然适合追加到同一行。

## Goals / Non-Goals

**Goals:**
- TUI 每轮推理结束后，在一行 dim 文本中展示 token 消耗（输入/输出）、API 成本、上下文窗口占用百分比
- 扩展 `turn:end` 事件 payload 使其携带完整 cost 信息
- 与现有 `⏱ total wait` 合并为一行，格式紧凑不喧宾夺主
- 上下文占比用 `▓▓ XX%` 方块展示，按阈值变色（≤80% dim，>80% yellow，>95% red）

**Non-Goals:**
- 不在 web 前端显示（web 有自己的 token 统计面板）
- 不做 session 级别的累计统计
- 不缓存历史 usage——只在该轮 `finishAssistantMessage()` 时输出一次
- 不做精确上下文 token 统计（使用 `estimateMessagesTokens` 估算，误差可接受）

## Decisions

### 1. 扩展 turn:end usage 而非新增事件

**选择**：扩展 `turn:end` 的 `usage` 字段为完整结构（含 cacheRead, cacheWrite, total, cost.total）

**备选**：新增独立的 `turn:usage` 事件

**理由**：usage 信息与 turn 结束是同一时序，拆分为两个事件会增加 handler 重数且无实际解耦收益。下游 TUI handler 只需在同一个回调里拿到全部信息。

### 2. 事件 payload 用扁平结构，不直接引入 pi-ai Usage 类型

**选择**：`{ input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } }`

**理由**：事件层应是框架自有类型，不应依赖 pi-ai 的内部类型。只取 TUI 展示需要的字段，cost 只带 `total`，不引入 `cost.input/output/cacheRead/cacheWrite` 四个细分字段。

### 3. 显示格式

**选择**：`⏱ 3.2s · 📊 12.4k↓ 3.2k↑ · ▓▓ 77% · 💰 $0.0032`

格式化规则：
- token：>= 1M → `1.2M`，>= 1000 → `12.4k`，否则原值
- cost：>= $0.01 → `$0.03`，否则 → `¢0.3`
- 各部分用 ` · ` 分隔
- 缺少某部分则省略（如无 wait time 则只显示 token、context 和 cost）
- `▓▓` 方块后跟百分比整数（四舍五入），≤80% dim 色，>80% yellow，>95% red

**备选**：分三行展示 → 占用过多垂直空间，不符合 TUI 紧凑风格

### 4. 格式化函数位置

**选择**：放在 `src/ui/tui-app.ts` 作为私有 helper 函数（模块级，非类方法）

**理由**：仅 TUI 使用，不需要跨模块复用。模块级函数便于测试且不污染类型接口。

### 5. 上下文占比数据来源

**选择**：`ContextManager.getEstimatedTokens(messages)` / `ContextManager.getContextWindow()`

**理由**：不依赖事件层新字段，`ContextManager` 已在 `TuiApp.deps` 中直接可访问。`getEstimatedTokens()` 基于字符数快速估算（~4 chars/token），在 dim 提示行场景精确度足够，无需精确 tokenizer。

### 6. 上下文百分比阈值配色

**选择**：≤80% dim（正常融入），>80% yellow（注意），>95% red（危险）

**理由**：直观的交通灯模式。80% 是自然注意力阈值，95% 以上需要立即行动（compact 或换模型）。颜色通过 `c.yellow()` / `c.red()` 应用，与 TUI 现有配色体系一致。

## Risks / Trade-offs

- **[cost 可能为 0]**：某些 provider 不返回 cost 数据时，`💰` 段会被省略。→ 静默降级，无异常。
- **[cache 数据可能不准确]**：部分 provider 的 cache 统计不稳定。→ 当前只传入 payload 但 TUI 首版不展示 cache，预留后续扩展。
- **[Web 端不受影响]**：web-backend 的 `turn:end` handler 不读取 usage，无破坏性。
- **[上下文估算有误差]**：`estimateMessagesTokens` 基于 ~4 chars/token 估算，可能偏离实际 ±15%。→ dim 提示行场景可接受，不做精确计数承诺。

## Open Questions

- 是否需要后续加 `/tokens` 命令展示 session 累计？→ 暂不纳入本 change
