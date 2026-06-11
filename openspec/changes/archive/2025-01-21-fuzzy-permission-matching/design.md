## Context

`tool-name-glob` 和 `claude-code-permission-format` 已定义了 glob 规则存储和匹配能力。`permission-persist-ui` 定义了 "Always Allow (save)" 一键保存精确工具名。

缺口：保存时只有精确名选项。用户想保存 `mcp__playcanvas__*` 只能手动编辑 settings.json。

本变更在保存时自动推导模糊模式，与精确名并列为两个选项，用户一键选择，零编辑。

## Goals / Non-Goals

**Goals:**
- "Always Allow (save)" 时同时展示精确和模糊两个选项
- 模糊模式由系统自动推导，用户无需编辑
- 对 MCP 工具推导 `mcp__<server>__*`；非 MCP 工具不展示模糊选项
- TUI 和 Web 均支持

**Non-Goals:**
- 手动编辑模式（不需要）
- 多层模糊（不需要 mid-level glob）
- 正则表达式
- 会话级授权变更

## Decisions

### Decision 1: 自动推导，不做手动编辑

模糊模式完全由系统根据工具名结构推导。用户只需在精确/模糊之间二选一。

**Rationale:** 90% 的模糊需求是「允许这个 MCP server 的所有工具」——`mcp__<server>__*`。不需要用户自己敲 `*`。

### Decision 2: 推导规则

- MCP 工具 (`mcp__<server>__<rest>`) → 模糊选项: `mcp__<server>__*`
- 非 MCP 工具（无 `__` 分隔符）→ 不展示模糊选项
- 未来可扩展：识别更多命名空间模式

### Decision 3: TUI 交互

按 `s` 后展开子选项：
```
[s] Always Allow (save)
  [1] exact:  mcp__playcanvas__create_scene
  [2] fuzzy:  mcp__playcanvas__*
```
按 `1` 保存精确，按 `2` 保存模糊。ESC 返回主选项。

### Decision 4: Web 交互

点击 "Save as Rule" 展开两个子按钮：
- "Exact: mcp__playcanvas__create_scene"
- "Fuzzy: mcp__playcanvas__*"

点击即保存，无额外确认。

## Risks / Trade-offs

- **Risk:** 用户误选模糊选项，授权范围超出预期 → **Mitigation:** 模糊选项始终显示完整的 pattern 字符串，用户看清楚再选
- **Risk:** 非 MCP 工具的模糊模式不够明显 → 当前不做，后续可加
