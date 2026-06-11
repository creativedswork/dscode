## Why

当前 `deriveFuzzyPattern` / `deriveFuzzyArgPattern` 用硬编码规则推导模糊模式——bash 取首词、文件工具取目录、MCP 取 server 前缀。覆盖 90% 场景，但遇到复杂调用就傻了：

| 调用 | 硬编码推导 | 理想推导 |
|------|-----------|---------|
| `git push origin main` | `git.*` | `git push.*` 更精确 |
| `npm run test -- --watch` | `npm.*` | `npm run test.*` |
| `read_file /src/components/Button.tsx` | `/src/*` | `/src/components/*` |
| `grep TODO /src/**/*.ts` | `/src/**/*` | 同上，区别不大 |

LLM 能理解语义分组。作为硬编码的 fallback：硬编码能推导就不调 LLM，硬编码覆盖不了才调。

## What Changes

- 新增 `deriveFuzzyPatternLLM(toolName, args, preview) → { toolPattern, argPattern, description }` 
- 硬编码派生优先；只有当硬编码返回不够精确（如 bash 只拿了首词但命令有明显子命令结构）或用户显式触发时，才调 LLM
- LLM 调用复用现有 `PromptUserFn` 管道，不新增依赖
- 结果缓存到会话级别（同工具+相似 args 不重复调）
- TUI/Web 子菜单新增 `[AI suggest]` 选项（仅 LLM 可用时显示）

## Decisions

### 硬编码优先，LLM 兜底

`deriveFuzzyPattern` / `deriveFuzzyArgPattern` 先跑。如果返回值看起来"够好了"（如 MCP server glob），不调 LLM。只有硬编码返回 null 或无区分度（bash 推导出 `.*`）时才考虑 LLM。

**Rationale**: 延迟和成本。MCP 工具弹权限是高频操作，每次等 LLM 不现实。

### LLM prompt 设计

```
Given this tool call:
  Tool: <toolName>
  Args: <argsJson>
  Preview: <preview>

Suggest 1-3 fuzzy permission patterns. Each pattern has:
  - pattern: glob for the tool name (e.g., "mcp__playcanvas__*")
  - argPattern: optional regex for args (e.g., "^\"git\"")
  - description: human-readable, shown in UI (e.g., "All git commands")

Prefer specific over broad. Prefer patterns the user would actually want.
If the tool call is already specific enough, suggest no patterns.
```

### 结果缓存

同一会话内，同一 toolName + 相似 args → 复用 LLM 结果。缓存 key = `${toolName}:${argsFingerprint}`。

### UI 变化

子菜单从固定 2-3 项变为动态列表：硬编码的 2-3 项 + LLM 建议的 0-3 项。LLM 建议项标注 `[AI]` 前缀。

## Risks

- **延迟**: LLM 调用 ~1-3s，用户等待 → 加 loading 指示，超时 3s 降级为只显示硬编码
- **质量**: LLM 可能给出过于宽泛的 pattern → 加后校验：pattern 不能是 `*`，argPattern 不能为空
- **成本**: 高频触发 → 缓存 + 硬编码优先控制调用量

## Non-Goals

- 不用 LLM 替代硬编码，只做补充
- 不改变现有 permission 存储格式
- 不做在线学习/用户反馈闭环
