# Fork 子代理共享 sessionId 对父代理缓存命中的影响分析

> 核心问题：Fork 子代理复用父 sessionId 作为 prompt_cache_key，是否会影响父代理自身的缓存命中率？

---

## 一、结论先行

**不会产生负面影响，反而有正向的"缓存预热"效果。** 但需要注意并发 Fork 数量对缓存容量的压力。

---

## 二、缓存模型推演

### 2.1 DeepSeek Prefix Cache 的核心机制

DeepSeek 的 Prompt Cache 基于**前缀树（Trie）**模型：

```
prompt_cache_key = "session-abc"

缓存中的前缀树：
                        [sys_prompt]
                             │
                        [tool_defs]
                             │
                        [msg_1: user]
                             │
                        [msg_2: assistant]        ← 父代理当前状态
                        /           \
              [placeholder]      [new_user_msg]    ← 分叉点
                   │                  │
              [directive_A]     [assistant_resp]   ← 不同分支
              (Fork-1 写入)    (父代理下个请求)

父代理下次请求: [sys][tools][msg1][msg2][assistant_resp]
  → 前缀匹配: [sys][tools][msg1][msg2] ✅ Cache Hit
  → [assistant_resp] 是新增的，正常 Miss
```

**关键洞察**：缓存存储的是**前缀**，不是完整的请求。父代理的请求前缀 `[sys][tools][msg1][msg2]` 是 Fork 请求前缀的子集，所以：

- Fork 的写入**不会覆盖**父代理的前缀
- Fork 的写入**扩展了**前缀树的覆盖范围
- 父代理下次请求命中的是**同一个前缀节点**

### 2.2 时序分析

```
═══════════════════════════════════════════════════════════════
时间线：父代理 → Fork × 3 → 父代理
═══════════════════════════════════════════════════════════════

T1: 父代理请求
    Body: [sys][tools][msg1][msg2]
    Cache 写入: [sys][tools][msg1][msg2] (5000 tokens)
    结果: Cache Miss (首个请求)

T2: Fork-1 请求 (key=same-session)
    Body: [sys][tools][msg1][msg2][placeholder][directive_A]
    前缀匹配: [sys][tools][msg1][msg2] → ✅ 5000 tokens Cache Hit
    新增缓存: [placeholder][directive_A] (200 tokens Miss)
    结果: 5000 Hit + 200 Miss

T3: Fork-2 请求 (key=same-session)  
    Body: [sys][tools][msg1][msg2][placeholder][directive_B]
    前缀匹配: [sys][tools][msg1][msg2][placeholder] → ✅ 5200 tokens Cache Hit
    新增缓存: [directive_B] 可能已存在 fork-1 的变体
    结果: ~5200 Hit + ~50 Miss

T4: Fork-3 请求 (key=same-session)
    Body: [sys][tools][msg1][msg2][placeholder][directive_C]
    前缀匹配: [sys][tools][msg1][msg2][placeholder] → ✅ 5200 tokens Cache Hit
    结果: ~5200 Hit + ~50 Miss

T5: 父代理请求 ← 关键！
    Body: [sys][tools][msg1][msg2][assistant_resp][new_user_msg]
    前缀匹配: [sys][tools][msg1][msg2] → ✅ 5000 tokens Cache Hit
    新增: [assistant_resp][new_user_msg] (800 tokens Miss)
    结果: 5000 Hit + 800 Miss

═══════════════════════════════════════════════════════════════
结论: Fork 不仅没有破坏父代理的缓存，T2-T4 期间 Fork 反复命中
     [sys][tools][msg1][msg2] 前缀反而「加固」了这段缓存的 LRU 权重
═══════════════════════════════════════════════════════════════
```

---

## 三、定量分析：Cache Hit Rate 对比

### 3.1 各方案对比

| 方案 | 父代理 Hit Rate | Fork Hit Rate | 总体节省 |
|------|----------------|---------------|----------|
| **A: 无缓存** | 0% | 0% | $0 |
| **B: Fork 独立 sessionId** | 同上（父代理独立） | 每个 Fork 首次都是 Miss | Fork 之间无法共享 |
| **C: Fork 共享父 sessionId**（推荐） | 同上 | Fork-1 少量 Miss，Fork-2/3 几乎全 Hit | **最大化** |

### 3.2 方案 B vs C 的 Token 成本对比

假设：系统提示 2000 tokens，工具定义 1000 tokens，历史消息 2000 tokens，占位符 200 tokens，directive 50 tokens。

```
方案 B: 独立 sessionId
┌──────────┬─────────┬─────────┬──────────┐
│          │  Hit    │  Miss   │  成本     │
├──────────┼─────────┼─────────┼──────────┤
│ Fork-1   │ 0       │ 5250    │ $0.735   │
│ Fork-2   │ 0       │ 5250    │ $0.735   │
│ Fork-3   │ 0       │ 5250    │ $0.735   │
├──────────┼─────────┼─────────┼──────────┤
│ 总计     │ Miss: 15750 tokens │ $2.205   │
└──────────┴─────────┴─────────┴──────────┘

方案 C: 共享父 sessionId
┌──────────┬─────────┬─────────┬──────────┐
│          │  Hit    │  Miss   │  成本     │
├──────────┼─────────┼─────────┼──────────┤
│ Fork-1   │ 5000    │ 250     │ $0.035   │
│ Fork-2   │ 5200    │ 50      │ $0.007   │
│ Fork-3   │ 5200    │ 50      │ $0.007   │
├──────────┼─────────┼─────────┼──────────┤
│ 总计     │ Hit: 15400, Miss: 350       │ $0.049   │
└──────────┴─────────┴─────────┴──────────┘

节省: $2.205 - $0.049 = $2.156 (97.8% 成本降低)
```

---

## 四、潜在风险与边界条件

### 4.1 风险 1：并发 Fork 过多导致缓存 Thrashing

```
Fork × 20 并发:
  缓存中可能同时存在 20 个不同的长前缀:
    [sys][tools][msg1][msg2][placeholder][directive_1]
    [sys][tools][msg1][msg2][placeholder][directive_2]
    ...
    [sys][tools][msg1][msg2][placeholder][directive_20]

  如果缓存容量有限（例如最多保留 100 个前缀），20 个变体可能挤掉
  其他更有价值的缓存条目。

  影响：父代理的前缀 [sys][tools][msg1][msg2] 仍然在缓存中（它是
  所有 20 个 Fork 前缀的公共祖先，LRU 权重最高，最不可能被驱逐）
```

**缓解策略**：
- 限制单次 Fork 数量（建议 ≤ 5）
- 使用 `prompt_cache_retention: "long"` 开启 24h 保留，避免短保留导致的过早失效

### 4.2 风险 2：工具定义变更导致全局 Cache Miss

```
T1: 父代理使用 tools=[Read, Write, Bash]
    Cache: [sys][tools_v1][msg1]

T2: MCP 加载了新工具
    父代理 tools 变为 [Read, Write, Bash, MCP_Slack]

T3: Fork 子代理如果使用 useExactTools=true（复用父代理的旧工具列表）
    → 与父代理新 tools 不一致 → Fork 前缀 = [sys][tools_v1][...]
    → 父代理前缀 = [sys][tools_v2][...]
    → tools_v1 ≠ tools_v2 → Fork 的缓存对父代理无用

    如果父代理在 T2 之后尚未发送请求：
    Fork 写入 [sys][tools_v1][...] 到缓存
    父代理后续发送 [sys][tools_v2][...] 
    → 在 tools 处分叉 → 仅 [sys] 命中（2000 tokens vs 5000 tokens）
```

**缓解策略**：
- Fork 子代理使用 `useExactTools=false`（使用当前最新的工具列表）
- 或者在工具定义变更时主动失效 Fork 缓存

### 4.3 风险 3：Fork 与父代理交替请求的时序问题

```
T1: 父代理请求 → Cache: [sys][tools][msg1]
T2: Fork-1 请求 → Cache: [sys][tools][msg1] + [sys][tools][msg1][placeholder][dir_A]
T3: 父代理请求 → 命中 [sys][tools][msg1]，写入 [sys][tools][msg1][assistant_resp]
T4: Fork-2 请求 → 请求前缀 [sys][tools][msg1][placeholder][dir_B]
                  → 当前缓存有 [sys][tools][msg1][assistant_resp] 
                  → Fork 前缀是 [sys][tools][msg1][placeholder]...
                  → 在 msg1 之后分叉 → 仅 [sys][tools][msg1] 命中

这不是问题，[sys][tools][msg1] 仍然命中。
Fork 的 placeholder 路径和父代理的 assistant_resp 路径在缓存中是
两个独立分支。
```

---

## 五、架构建议

### 5.1 推荐方案：共享 sessionId + 前缀一致性保证

```typescript
// Fork 子代理的 runAgent 改造
async function runForkedAgent(params: ForkedAgentParams) {
  // ⚠️ 核心：复用父代理的 sessionId
  const cacheKey = params.parentSessionId; 

  const agent = new Agent({
    initialState: {
      // ⚠️ 必须逐字节相同
      systemPrompt: params.parentRenderedSystemPrompt,
      tools: params.parentExactTools,  // useExactTools=true
      model: params.parentModel,       // 同模型，否则缓存不共享
      thinkingLevel: params.parentThinkingLevel,
    },
    streamFn: (model, ctx, opts) => streamSimple(model, ctx, {
      ...opts,
      sessionId: cacheKey,             // ← 共享父 sessionId
      cacheRetention: "short",
    }),
  });

  // ⚠️ buildForkedMessages 确保前缀一致
  const forkMessages = buildForkedMessages(
    params.directive,
    params.parentAssistantMessage,
    params.parentHistory,
  );
  
  return agent.run(forkMessages);
}
```

### 5.2 缓存监控指标

```typescript
// 在 streamFn 回调中记录缓存效果
function monitorCacheEfficiency(usage: Usage, label: string) {
  const hitRate = usage.cacheRead / (usage.cacheRead + usage.input || 1);
  
  if (label === 'fork') {
    // Fork 的预期命中率应该 > 90%
    if (hitRate < 0.9) {
      console.warn(`[Fork] Low cache hit rate: ${(hitRate * 100).toFixed(1)}%`);
    }
  }
  
  if (label === 'parent') {
    // 父代理在 Fork 之后应该仍然有高命中率
    if (hitRate < 0.7) {
      console.warn(`[Parent] Possible cache pollution after forks, hit rate: ${(hitRate * 100).toFixed(1)}%`);
    }
  }
}
```

---

## 六、最终结论

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  问：Fork 子代理共享父 sessionId 会影响父代理缓存命中吗？       │
│                                                              │
│  答：不会。原因如下：                                          │
│                                                              │
│  1. 前缀树模型：父前缀是 Fork 前缀的子集，二者共享相同前缀节点    │
│  2. LRU 加固：Fork 反复命中父前缀，增加该节点的 LRU 权重         │
│  3. 无覆盖风险：Fork 扩展前缀树，不修改已有节点                  │
│  4. 缓存预热：Fork 请求提前将父前缀写入缓存                      │
│                                                              │
│  唯一风险：并发 Fork 过多 (>20) 可能挤占缓存容量，                │
│  但父前缀作为公共祖先，LRU 权重最高，最不可能被驱逐               │
│                                                              │
│  推荐：使用共享 sessionId 方案，配合前缀一致性保证               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```
