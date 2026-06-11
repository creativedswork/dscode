## Context

`fuzzy-permission-matching` 已落地硬编码模糊推导：bash 取首词、文件工具取目录、MCP 取 server 前缀。覆盖 90% 场景，但无法推导语义分组（如 `git push.*` vs `git.*`）。

LLM 可以作为硬编码的补充——但延迟 1-3s 不适合同步阻塞权限弹窗。因此采用**异步预取 + 缓存**策略，用户无感知等待。

## Goals / Non-Goals

**Goals:**
- LLM 推导更精确的模糊模式（语义分组、子命令识别）
- 首次弹窗不等待 LLM（硬编码即时显示）
- 后台异步调用 LLM，结果缓存供后续使用
- 缓存键 = `toolName:args前80字符`

**Non-Goals:**
- 替代硬编码（LLM 是补充，不是替代）
- 同步等待 LLM（不做阻塞式用户体验）
- 跨会话缓存（仅会话内有效）
- 动态更新当前弹窗（不推送 LLM 结果到已显示的 UI）

## Decisions

### Decision 1: 异步预取 + 会话缓存

`prefetchLlmSuggestions()` 在弹窗后 fire-and-forget 调用 `complete()`。结果写入内存 `suggestionCache`（`Map<string, LlmSuggestion[]>`）。下次同 tool+args 弹窗时，`getLlmSuggestions()` 读取缓存。

**Rationale**: 首次弹窗零延迟。高频场景（同一 MCP 工具反复调用）受益最大。

**Alternatives considered:**
- 同步等待 + timeout → 拒绝：即使 1s 延迟用户也感知
- 后台完成后推送更新当前弹窗 → 拒绝：UI 复杂度高，收益低（多数情况一次授权就够了）
- 持久化到 settings.json → 拒绝：LLM 建议是上下文相关的，不应跨会话持久化

### Decision 2: 缓存键设计

`cacheKey(toolName, args): string` = `${toolName}:${args前80字符}`。

args 取前 80 字符做指纹——足够区分 `git push` 和 `git commit`，又不会因为 `git push origin main --force` 和 `git push origin develop` 产生重复缓存。

**Rationale**: 80 字符在区分度和命中率之间平衡。太短（如 20）则 `npm install react` 和 `npm run test` 碰撞；太长（如 200）则微小参数差异导致缓存未命中。

### Decision 3: Prompt 设计

Prompt 要求 JSON-only 输出，包含 example。要求 `toolPattern` 和 `argPattern` 分开，`null` 表示不限制。限制 2 条建议，prefer specific over broad。

**Rationale**: JSON 输出便于解析。example 引导 LLM 输出正确格式。限制条数减少 token 消耗。

### Decision 4: LLM 结果解析防御

`parseSuggestions()` 提取文本中的 JSON 数组，过滤无效条目（空 label、过长 label、非数组）。解析失败静默忽略。

**Rationale**: LLM 输出不可靠，必须有防御性解析。静默降级（不显示 LLM 建议）优于报错。

### Decision 5: 模型选择

使用当前活跃模型（`resolveModel(provider, modelId)`）。不固定模型。

**Rationale**: 用户已配置的模型就是最优选择。不引入额外模型依赖。

## Risks / Trade-offs

- **风险**: LLM 建议过于宽泛（如建议 `.*`）→ **缓解**: prompt 强调 prefer specific；后续可加后校验过滤 `.*` 和空 pattern
- **风险**: LLM 调用失败（网络、额度、超时）→ **缓解**: catch 静默降级，不影响硬编码功能
- **风险**: 缓存占用内存 → **缓解**: 仅会话级别，会话结束自动释放；单条缓存 < 500B
- **权衡**: 首次弹窗无 LLM 建议 → 用户可能需要第二次触发同一工具才能受益。这是刻意为之的延迟 vs 体验权衡

## Data Flow

```
PermissionManager.check()
  → promptUser(toolName, preview, args)
    → deriveFuzzyPattern() + deriveFuzzyArgPattern()  // 硬编码，即时
    → getLlmSuggestions()                              // 读缓存，即时
    → showPermissionPrompt(...)                         // 显示硬编码 + 缓存 LLM
    → prefetchLlmSuggestions(model, ...)               // 后台异步，fire-and-forget
      → complete() → parse → suggestionCache.set()
```

缓存生命周期：会话开始为空 Map，会话结束 GC 回收。
