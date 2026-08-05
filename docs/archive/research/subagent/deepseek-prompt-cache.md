# DeepSeek API Prompt Cache 深度分析

> 基于 dscode / pi-ai 源码和 DeepSeek API 行为分析，梳理 DeepSeek Prompt Cache 的机制、现状和 Fork SubAgent 适配策略

---

## 一、结论先行

**DeepSeek API 已经原生支持 Prompt Caching**，且 dscode 通过 `@mariozechner/pi-ai` 库已经在使用它。这与之前"DeepSeek 没有 Prompt Cache"的假设**相反**。

关键数据：

| 模型 | Input 价格 ($/M tokens) | Cache Read 价格 ($/M tokens) | 折扣率 | Cache Write 价格 |
|------|------------------------|------------------------------|--------|------------------|
| deepseek-v4-flash | $0.14 | $0.028 | **80% off** | **免费** |
| deepseek-v4-pro | $1.74 | $0.145 | **92% off** | **免费** |

> 对比 Anthropic Claude Sonnet 4：cache write 价格是 base input 的 **1.25x**（写入缓存反而更贵），DeepSeek 的缓存写入免费是**显著优势**。

---

## 二、DeepSeek Prompt Cache 工作原理

### 2.1 API 协议

DeepSeek 的 Prompt Cache 通过两个请求参数控制：

```json
{
  "model": "deepseek-v4-flash",
  "messages": [...],
  "stream": true,
  "prompt_cache_key": "<session-uuid>",       // 缓存键，相同 key 共享缓存
  "prompt_cache_retention": "24h"             // 可选：长保留（默认 session 级别短保留）
}
```

**响应中的 usage 信息**：
```json
{
  "usage": {
    "prompt_tokens": 5000,
    "completion_tokens": 800,
    "prompt_cache_hit_tokens": 3000,          // 命中缓存的 token 数
    "prompt_cache_miss_tokens": 2000,         // 未命中缓存的 token 数
    "total_tokens": 5800
  }
}
```

### 2.2 缓存语义

与 Anthropic 的显式 `cache_control` 断点标记不同，DeepSeek 采用**自动前缀匹配**策略：

```
┌─────────────────────────────────────────────────────────┐
│                DeepSeek Prompt Cache 模型                 │
│                                                         │
│  请求 N:  [system][tool_defs][msg1][msg2][msg3][msg4]   │
│  请求 N+1:[system][tool_defs][msg1][msg2][msg5][msg6]   │
│                         ↑________↑                       │
│                    前缀相同 → Cache Hit                   │
│                                                         │
│  核心原则：相同 prompt_cache_key + 相同前缀 = Cache Hit    │
└─────────────────────────────────────────────────────────┘
```

**关键差异 vs Anthropic**：

| 维度 | Anthropic (Claude) | DeepSeek |
|------|-------------------|----------|
| 缓存标记方式 | 显式 `cache_control: {type: "ephemeral"}` 标记断点 | 自动前缀匹配 |
| 缓存粒度 | 逐块标记，灵活控制 | 整个前缀自动缓存 |
| 缓存写入成本 | **1.25x** base input price | **免费** |
| 缓存读取折扣 | 90% off | 80-92% off |
| 缓存生命周期 | ephemeral (5 min) 或 TTL | session 级别 / 可选 24h |
| API 参数 | 通过 content block 的 cache_control | `prompt_cache_key` + `prompt_cache_retention` |

### 2.3 dscode / pi-ai 中的实现

在 `@mariozechner/pi-ai` 库中，缓存已自动启用：

```javascript
// openai-completions.js (pi-ai 库)
function buildParams(model, context, options, compat, cacheRetention) {
  const params = {
    model: model.id,
    messages,
    stream: true,
    // 当使用 api.deepseek.com 时，自动注入 prompt_cache_key
    prompt_cache_key: model.baseUrl.includes("api.openai.com") && cacheRetention !== "none"
      ? options?.sessionId      // ← 使用 sessionId 作为缓存键
      : undefined,
    // 可通过 PI_CACHE_RETENTION=long 启用 24h 长保留
    prompt_cache_retention: cacheRetention === "long" && compat.supportsLongCacheRetention 
      ? "24h" 
      : undefined,
  };
}

// 缓存保留策略
function resolveCacheRetention(cacheRetention) {
  if (cacheRetention) return cacheRetention;
  if (process.env.PI_CACHE_RETENTION === "long") return "long";
  return "short";  // 默认 session 级别
}
```

**dscode 当前行为**：每个 Harness 实例创建一个 Agent，每次 API 调用自动携带 `sessionId` 作为 `prompt_cache_key`。这意味着：

- ✅ **同一会话内的连续请求自动享受缓存**（前缀不变的部分被缓存）
- ❌ **没有显式的 Fork 子代理缓存共享策略**（因为还不存在子代理）
- ❌ **缓存保留默认是 session 级别**（会话结束后缓存失效）

---

## 三、对 Fork SubAgent 设计的影响

### 3.1 Fork SubAgent 的缓存策略需要重新设计

Claude Code 的 Fork SubAgent 依赖 Anthropic 的**显式 cache_control 标记**来确保多个 Fork 子代理共享相同的缓存前缀。策略是：

1. Fork 子代理**逐字节复用**父代理的系统提示 + 工具定义 + 对话前缀
2. 仅最后的 directive 文本块不同

在 DeepSeek 上，这套策略**仍然有效但实现方式不同**：

| Claude Code (Anthropic) | dscode (DeepSeek) 适配 |
|--------------------------|------------------------|
| 逐字节复制系统提示 | **相同**：需要确保 Fork 子代理使用相同的系统提示字节 |
| 逐字节复制工具定义 | **相同**：使用 `useExactTools` 确保工具 Schema 一致 |
| 通过 `cache_control` 标记缓存边界 | **不需要**：DeepSeek 自动前缀匹配，无需显式标记 |
| 需要确保 tool_result 占位符相同 | **需要**：确保前缀逐字节一致 |
| 父代理的 `renderedSystemPrompt` 传递 | **需要**：确保 Fork 子代理不重新调用 `getSystemPrompt()` |

### 3.2 关键差异：prompt_cache_key 的作用

DeepSeek 的缓存是按 `prompt_cache_key` 分组的。这意味着：

```
如果所有 Fork 子代理使用相同的 prompt_cache_key（父代理的 sessionId）：
  
  Fork-1: key=session-abc, prefix=[sys][tools][msgs...][directive-A]  ← Cache Hit (前缀共享)
  Fork-2: key=session-abc, prefix=[sys][tools][msgs...][directive-B]  ← Cache Hit (前缀共享)
  Fork-3: key=session-abc, prefix=[sys][tools][msgs...][directive-C]  ← Cache Hit (前缀共享)

如果每个 Fork 使用不同的 prompt_cache_key：
  
  Fork-1: key=uuid-1, prefix=[sys][tools][msgs...][directive-A]  ← Cache Miss
  Fork-2: key=uuid-2, prefix=[sys][tools][msgs...][directive-B]  ← Cache Miss
  Fork-3: key=uuid-3, prefix=[sys][tools][msgs...][directive-C]  ← Cache Miss
```

**结论**：Fork 子代理必须使用父代理的 `sessionId` 作为 `prompt_cache_key`，且确保请求前缀一致。

### 3.3 适配后的 Fork 策略

```
┌─────────────────────────────────────────────────────────────────┐
│              DeepSeek 版 Fork SubAgent 缓存策略                    │
│                                                                 │
│  父 Agent 调用 Agent({description: "audit", prompt: "审计..."})   │
│  │                                                              │
│  ├─ 构建 Fork 消息（与 Claude Code 相同的 buildForkedMessages）   │
│  │   [...history, assistant(all_tool_uses),                     │
│  │    user(placeholder_results..., directive)]                  │
│  │                                                              │
│  ├─ Fork-1: key=父sessionId, 前缀与父代理相同 → Cache Hit        │
│  ├─ Fork-2: key=父sessionId, 前缀与父代理相同 → Cache Hit        │
│  └─ Fork-3: key=父sessionId, 前缀与父代理相同 → Cache Hit        │
│                                                                 │
│  需要保证的缓存一致性条件：                                        │
│  1. prompt_cache_key 相同 (使用父 sessionId)                     │
│  2. 系统提示逐字节相同 (传递 renderedSystemPrompt)                │
│  3. 工具定义逐字节相同 (useExactTools)                            │
│  4. 消息前缀逐字节相同 (统一占位符 tool_result)                    │
│  5. 仅最后的 directive 文本块不同                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 对 dscode 现有架构的改动

dscode 的 `streamSimple()` 已经在使用 `sessionId` 作为 `prompt_cache_key`。实现 Fork SubAgent 时需要：

1. **确保子代理复用父代理的 sessionId**（而非生成新 UUID）作为 prompt_cache_key
2. **确保子代理的 API 请求前缀与父代理一致**（系统提示 + 工具定义 + 消息前缀）
3. **不需要**像 Anthropic 那样操作 `cache_control` 断点标记

---

## 四、DeepSeek Prompt Cache 的局限性

### 4.1 不支持的场景

| 场景 | Anthropic | DeepSeek |
|------|-----------|----------|
| 跨会话缓存 | ❌ (ephemeral) | ✅ (24h 长保留可选) |
| 部分缓存命中 | ✅ (通过多个 cache_control 断点) | ⚠️ 仅前缀匹配，无法跳跃命中 |
| 选择性缓存（跳过中间部分） | ✅ | ❌ 不支持 |
| 免费缓存写入 | ❌ (1.25x 成本) | ✅ |
| 多模型共享缓存 | ❌ | 未知 |

### 4.2 实际影响

- **前缀一致性要求更高**：DeepSeek 只做前缀匹配，中间任何一个字节不同都会导致后续全部 Cache Miss
- **无法跳跃缓存**：如果 fork 子代理的消息前缀中间有一个不同的 tool_result，Anthropic 可以通过 cache_control 在断点后重新开始缓存，但 DeepSeek 不行——它只能从开头匹配
- **Fork 的 placeholder tool_result 至关重要**：必须确保所有 fork 子代理的请求前缀完全一致，这是 Cache Hit 的前提

---

## 五、建议的 Fork SubAgent 实现方案

### 5.1 核心代码适配

```typescript
// Fork 子代理的 runAgent 改造
async function runForkedAgent(params: ForkedAgentParams) {
  const { agentDefinition, promptMessages, parentSessionId, parentSystemPrompt, parentTools } = params;

  // 创建子 Agent 实例
  const agent = new Agent({
    initialState: {
      systemPrompt: parentSystemPrompt,    // 复用父代理的渲染后系统提示
      model: parentModel,
      tools: parentTools,                  // 复用父代理的精确工具列表
      thinkingLevel: parentThinkingLevel,
    },
    streamFn: (model, ctx, opts) => streamSimple(model, ctx, {
      ...opts,
      // ⚠️ 关键：使用父 sessionId 作为 prompt_cache_key
      sessionId: parentSessionId,
      // 可选：启用长保留
      cacheRetention: "short",
    }),
    // ...
  });
}
```

### 5.2 环境变量配置

```bash
# 启用 24h 长保留缓存（跨会话共享）
export PI_CACHE_RETENTION=long

# 禁用缓存（调试用）
export PI_CACHE_RETENTION=none
```

### 5.3 缓存命中率监控

```typescript
// 在 afterToolCall 或 streamFn 回调中监控缓存效果
function logCacheMetrics(usage: Usage) {
  const cacheHitRate = usage.cacheRead / (usage.cacheRead + usage.input);
  console.log(`Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
  console.log(`Cache read tokens: ${usage.cacheRead}, Input tokens: ${usage.input}`);
}
```

---

## 六、建议官方支持的 Issue 要点

尽管 DeepSeek API 已支持基础 Prompt Cache，但与 Anthropic 的 `cache_control` 相比仍有差距。以下是可以向 DeepSeek 官方建议的功能：

### 6.1 已有但可增强的功能

| 当前状态 | 建议 |
|----------|------|
| ✅ 自动前缀缓存 | 保持 |
| ✅ `prompt_cache_key` 分组 | 保持 |
| ✅ 24h 长保留 | 保持 |
| ✅ 免费缓存写入 | 保持 |
| ⚠️ 仅前缀匹配 | **建议 1**：支持多断点缓存（类似 Anthropic cache_control） |
| ⚠️ 无显式控制 | **建议 2**：支持 content block 级别的 cache_control 标记 |
| ❓ 缓存命中率不可见（API 侧） | **建议 3**：增加 `prompt_cache_hit_rate` 指标 |

### 6.2 建议新增的功能

1. **多断点缓存**：支持在消息列表的任意位置设置缓存断点，允许跳跃式缓存命中
2. **显式 cache_control 标记**：兼容 Anthropic SDK 的 `cache_control: {type: "ephemeral"}` 语法
3. **缓存命中率指标**：在 API response headers 中返回缓存命中率，便于客户端优化
4. **缓存预热 API**：允许提前写入缓存（如通过 `prompt_cache_warmup: true` 参数），避免首个请求的 Cache Miss
5. **跨模型缓存共享**：相同系统提示在不同 DeepSeek 模型间共享缓存

---

## 七、总结

```
┌──────────────────────────────────────────────────────────────┐
│                    核心结论                                    │
│                                                              │
│  1. DeepSeek API 已原生支持 Prompt Cache                       │
│  2. dscode 通过 pi-ai 库已经在使用它                            │
│  3. Fork SubAgent 的缓存共享策略需要适配（非照搬 Anthropic）      │
│  4. DeepSeek 的自动前缀匹配比 Anthropic 更简单但有局限性         │
│  5. 适配成本较低：只需确保子代理复用 sessionId 和请求前缀        │
│  6. 缓存写入免费是 DeepSeek 的独特优势                          │
└──────────────────────────────────────────────────────────────┘
```

**Fork SubAgent 在 DeepSeek 上完全可行**，且适配成本比最初预期的要低。不需要像 Anthropic 那样精细操作 `cache_control` 断点，只需保证：

- ✅ 相同的 `prompt_cache_key`（父 sessionId）
- ✅ 逐字节相同的请求前缀（系统提示 + 工具 + 消息前缀）
- ✅ Fork 子代理仅最后的 directive 文本不同
