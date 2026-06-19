## Context

当前架构中，工具执行结果通过两条路径到达前端 UI：

```
                    工具执行 (harness.ts)
                         │
                         ▼
                   tool:end 事件
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
    Live 路径                        History 路径
    web-backend.ts:121              display.ts:rebuildDisplayMessages
    slice(0, 5000)                  之前无截断，临时加了 MAX_RESULT=600
         │                               │
         ▼                               ▼
    broadcast tool_end              broadcast ready (messages)
         │                               │
         └───────────────┬───────────────┘
                         ▼
                   reducer.ts → ToolCard
```

两条路径独立实现了截断逻辑，行为不一致。之前修过（在 live 路径加了 `slice(0,5000)`），但 history 路径被遗漏，导致问题复现。

## Goals / Non-Goals

**Goals:**
- 所有工具结果在进入 UI 管道前经过**同一个**格式化函数
- `write_file` / `overwrite_file` 的锚点预览被智能折叠，只保留用户关心的摘要
- 未知工具的默认行为是安全截断（不会无限制透传）
- 未来新增工具时，默认就被保护（无需记得去改截断逻辑）

**Non-Goals:**
- 不改变工具本身的返回值结构（`{ content, details }` 格式不变）
- 不改变前端 `ToolCard` 的渲染逻辑（`max-h-40 overflow-y-auto` 作为防御层保留）
- 不改变 TUI 的展示逻辑（TUI 路径有自己的 `toolResultPreview` 截断，本提案暂不统一）

## Decisions

### Decision 1: Formatter 放在 `src/ui/shared/` 下

**Choice:** `src/ui/shared/tool-result-formatter.ts`，被 web-backend 和 display.ts 共同 import。

**Rationale:** `src/ui/shared/` 已经是 TUI + Web UI 共享代码的位置（`types.ts`、`reducer.ts` 都在此）。Formatter 放在这里，TUI 后续也可以复用。

**Alternatives considered:**
- 放在 `src/session/` 下：逻辑上合理（属于展示层），但 TUI 不 import session 模块
- 放在 `web-backend.ts` 内部：只有 live 路径能用，history 路径用不了

### Decision 2: 工具感知的格式化（而非统一截断长度）

**Choice:** `switch (toolName)` 结构，每个工具可以有独立的摘要提取逻辑。默认走安全截断。

**Rationale:** `write_file` 的有用信息（"Written 23577 bytes to path"）只有 ~60 字符，锚点预览是给 agent 看的内部元数据。盲目截断到 600 字符仍然会包含大量噪声。工具感知的格式化可以提取真正的摘要。

**Alternatives considered:**
- 统一截断到更短的长度（如 200 字符）：对 `write_file` 够了，但对 `bash` 等工具会丢失有用的错误输出
- 不改 formatter，只在 `display.ts` 和 `web-backend.ts` 里统一截断长度：治标不治本，魔法数字问题仍在

### Decision 3: 默认截断 600 字符 + 截断提示

**Choice:** 未知工具默认：`raw.slice(0, 600) + "\n… (N more chars)"`。

**Rationale:** 600 字符足够展示大部分工具的关键输出（bash 错误、grep 结果等），同时防止极端情况。截断提示让用户知道内容被裁剪了。

**Alternatives considered:**
- 默认不截断：不安全，新工具可能返回巨大输出
- 默认截断到 200：对 bash/grep 等工具太短，丢失有用信息

### Decision 4: `write_file` 摘要只保留前两行

**Choice:** 提取首行（bytes written）和次行（file version），其余用 `"… (N more lines — anchor preview hidden)"` 折叠。

**Rationale:** 
- 第 1 行：`Written 23577 bytes to /path/index.html` — 用户关心的核心信息
- 第 2 行：`New file version: fv_2a818c68` — 版本追踪
- 之后：锚点预览 — agent 的内部元数据，用户不需要看到

**Alternatives considered:**
- 保留前 5 行：会包含锚点预览头部噪音
- 完全不截断 write_file：就是当前的 bug

## Data Flow (After)

```
                Tool Execution
                     │
                     ▼
              harness.ts 发出 tool:end
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   Live 路径                  History 路径
   web-backend.ts            display.ts
        │                         │
        └────────┬────────────────┘
                 ▼
    formatToolResultForUI(toolName, rawText)
                 │
        (格式化后的字符串)
                 │
    ┌────────────┴────────────┐
    ▼                         ▼
 broadcast tool_end      broadcast ready
```

## Risks / Trade-offs

- **Risk:** `write_file` 结果格式变化会导致 agent 看到不同的输出吗？**No** — formatter 只影响 UI 展示路径。Agent 看到的仍然是完整的 toolResult 内容（通过 `agent.state.messages` 中的原始 content blocks）。
- **Risk:** 新工具忘记加 case 会怎样？**Safe** — 默认走 600 字符截断，不会无限制透传。
- **Trade-off:** `write_file` 的锚点预览在 UI 中不再可见 → 用户无法从 UI 复制锚点 hash。但用户本来就不需要锚点 hash（那是 agent 内部使用的），对普通用户是纯粹噪音。
