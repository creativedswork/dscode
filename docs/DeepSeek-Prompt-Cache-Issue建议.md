# DeepSeek API Prompt Cache 增强建议

> 标题建议：`Feature Request: Enhanced Prompt Cache with Multi-Breakpoint Support and Explicit cache_control Markers`

---

## Summary

DeepSeek API already supports Prompt Caching via `prompt_cache_key` and `prompt_cache_retention` parameters, which provides automatic prefix-based caching. This is a great foundation. However, to enable advanced AI agent patterns (such as multi-agent delegation, fork/parallel sub-agents), the following enhancements would be highly impactful.

---

## Current Behavior

The current Prompt Cache implementation:

| Feature | Status | Description |
|---------|--------|-------------|
| `prompt_cache_key` | ✅ | Session-based cache grouping |
| `prompt_cache_retention` | ✅ | Optional 24h long retention |
| Auto prefix caching | ✅ | Automatically caches shared prefixes |
| Free cache writes | ✅ | No additional cost for writing to cache |
| Cache read discount | ✅ | 80-92% discount on cache hits |

**Current Cache Model**:

```
Request 1: [system][tools][msg_A][msg_B][msg_C]  → Cache: [system][tools][msg_A][msg_B][msg_C]
Request 2: [system][tools][msg_A][msg_B][msg_D]  → Cache Hit on [system][tools][msg_A][msg_B]
Request 3: [system][tools][msg_X][msg_B][msg_C]  → Cache Hit on [system][tools] only
```

The limitation: only **contiguous prefix matching** is supported. If the first differing byte is at position 100, everything from position 100 onward is a cache miss, even if later content is identical to a previously cached request.

---

## Problem Statement

Modern AI coding agents (e.g., Claude Code, Cursor, dscode) use **parallel sub-agent delegation** patterns where:

1. A parent agent spawns multiple "fork" sub-agents with **identical system prompts and tool definitions**
2. Each sub-agent shares the parent's conversation history as prefix
3. Only the final "directive" message differs between sub-agents

**Example**:

```
Fork-1: [system_prompt][tool_defs][msg_1]...[msg_N][tool_results_placeholder][directive_A]
Fork-2: [system_prompt][tool_defs][msg_1]...[msg_N][tool_results_placeholder][directive_B]  
Fork-3: [system_prompt][tool_defs][msg_1]...[msg_N][tool_results_placeholder][directive_C]
```

With Anthropic's `cache_control` API, developers can explicitly mark cache breakpoints:

```json
{
  "messages": [
    {"role": "system", "content": "...", "cache_control": {"type": "ephemeral"}},
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "directive_A"}  // ← Only this differs
  ]
}
```

With the current DeepSeek auto-prefix model, this pattern works **only if**:
- All requests share the same `prompt_cache_key`
- The prefix is byte-identical up to the divergence point

This is workable but **brittle** — any tool definition change, permission mode toggle, or system prompt adjustment breaks the entire cache for all forks.

---

## Proposed Enhancements

### Enhancement 1: Explicit `cache_control` Markers (High Priority)

Support Anthropic-compatible `cache_control` markers on content blocks:

```json
{
  "messages": [
    {
      "role": "system", 
      "content": "You are a coding assistant...",
      "cache_control": {"type": "ephemeral"}
    },
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "Analyze this file", "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": "Actually, focus on security issues"}
      ]
    }
  ]
}
```

**Benefits**:
- Backward compatible (ignored if not supported)
- Developers can precisely control cache boundaries
- Compatible with Anthropic SDK / ecosystem

### Enhancement 2: Multi-Breakpoint Cache (High Priority)

Allow multiple independent cache segments within a single request:

```
Request:  [sys | cache_control] [tools | cache_control] [msg_A] [msg_B | cache_control] [msg_C]

Cache entries:
  Segment 1: [sys]
  Segment 2: [tools]
  Segment 3: [sys][tools][msg_A][msg_B]
```

A subsequent request matching any segment prefix gets a cache hit on that segment:

```
Request: [sys] [tools] [msg_X] [msg_B] [msg_C]
                          ↑_______________↑
              Segments 1+2 hit, msg_B alone isn't a segment start
```

**Benefits**:
- Enables "resume from checkpoint" patterns
- Significantly improves cache hit rates for complex agent workflows

### Enhancement 3: Cache Hit Metrics in Response (Medium Priority)

Add cache-related headers or usage fields:

```json
{
  "usage": {
    "prompt_tokens": 5000,
    "completion_tokens": 800,
    "prompt_cache_hit_tokens": 3000,
    "prompt_cache_miss_tokens": 2000,
    "prompt_cache_hit_rate": 0.6,           // ← NEW
    "prompt_cache_segments_hit": 3,         // ← NEW
    "prompt_cache_segments_total": 5        // ← NEW
  }
}
```

Or as response headers:
```
x-deepseek-cache-hit-rate: 0.60
x-deepseek-cache-segments: 3/5
```

**Benefits**:
- Enables client-side cache optimization
- Helps developers understand caching behavior without guesswork

### Enhancement 4: Cache Warmup Endpoint (Low Priority)

```bash
POST /v1/chat/completions/cache/warmup
{
  "model": "deepseek-v4-flash",
  "messages": [...],
  "prompt_cache_key": "session-abc",
  "prompt_cache_retention": "24h"
}
# Returns immediately, no completion generated
```

**Benefits**:
- Pre-warm cache before user-facing requests
- Eliminates cold-start cache miss latency

### Enhancement 5: Cross-Model Cache Sharing (Low Priority)

Allow cache segments to be shared across compatible DeepSeek models:

```json
{
  "prompt_cache_key": "session-abc",
  "prompt_cache_model_family": "deepseek-v4"  // Shares cache across v4-flash and v4-pro
}
```

---

## Use Case: AI Agent Fork/Parallel Delegation

### Without Enhanced Caching

```
Parent agent spawns 3 fork sub-agents (identical system + tools + history):

Fork-1: Cache Key=sess-1 → reads [sys][tools][history] 5000 tokens → $0.70 (cache read)
Fork-2: Cache Key=sess-1 → reads [sys][tools][history] 5000 tokens → $0.70 (cache read)  
Fork-3: Cache Key=sess-1 → reads [sys][tools][history] 5000 tokens → $0.70 (cache read)

Total cache cost: $2.10 (vs $21.00 without cache → 90% savings already!)
```

### With Enhanced Multi-Breakpoint Caching

```
Fork-1: Seg-1[sys] hit + Seg-2[tools] hit + Seg-3[history+directive_A] miss
Fork-2: Seg-1[sys] hit + Seg-2[tools] hit + Seg-3[history+directive_B] miss
Fork-3: Seg-1[sys] hit + Seg-2[tools] hit + Seg-3[history+directive_C] miss

The multi-breakpoint approach allows:
- sys+tools reused even when history diverges
- Better resilience to tool definition changes
```

---

## Comparison with Competitors

| Feature | OpenAI | Anthropic | Google Gemini | DeepSeek (now) | DeepSeek (proposed) |
|---------|--------|-----------|---------------|----------------|---------------------|
| Auto prefix cache | ✅ | ✅ | ✅ | ✅ | ✅ |
| Explicit cache markers | ❌ | ✅ | ❌ | ❌ | ✅ |
| Multi-breakpoint | ❌ | ✅ | ❌ | ❌ | ✅ |
| Free cache writes | ❌ | ❌ | ✅ | ✅ | ✅ |
| 24h retention | ❌ | ❌ | ❌ | ✅ | ✅ |
| Cache metrics | ❌ | ✅ | ❌ | ❌ | ✅ |
| Cross-model sharing | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Impact

Implementing these enhancements would:

1. **Make DeepSeek the most cache-efficient API for AI agents** — leveraging the already-free cache writes as a competitive advantage
2. **Enable complex multi-agent workflows** — critical for enterprise AI coding tools
3. **Attract tooling ecosystem** — framework authors (pi-ai, LangChain, Vercel AI SDK) would add first-class DeepSeek cache support
4. **Reduce costs for high-volume users** — compounding savings from better cache hit rates

---

## References

- Anthropic Prompt Caching docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- pi-ai library DeepSeek cache implementation: `@mariozechner/pi-ai` (open source)
- dscode project: https://github.com/wangcan26/dscode
