## Context

Currently, `src/core/harness.ts` (753 lines) contains ~60 lines of model definitions and resolution logic inline:

- `DASHSCOPE_BASE` constant (line 24)
- `QWEN_MODELS` dictionary (lines 26-93) mapping model IDs to `Model<Api>` partial definitions
- `buildQwenModel()` factory (lines 95-111)
- `Harness.resolveModel()` method (lines 130-140)

The `Harness` class uses this for agent initialization, `/model` switching, and thinking-level auto-adjustment. As more providers (DeepSeek, Kimi, OpenAI, Anthropic) are supported through `pi-ai`'s built-in `getModel()`, the custom model definitions are only needed for providers not in pi-ai's registry (notably Qwen/DashScope). However, the current structure makes it hard to add any provider-specific overrides or metadata without editing the harness.

`src/core/config.ts` also contains a thinking-level heuristic (line 179) that duplicates logic from `harness.ts` (line 351).

## Goals / Non-Goals

**Goals:**
- Extract all model definitions into `src/models/` with a clean, provider-extensible structure
- Provide a single `resolveModel(provider, modelId)` function that the harness calls
- Attach thinking-level preference to model metadata so the heuristic lives in one place
- Keep the change fully backward-compatible — no config or CLI changes

**Non-Goals:**
- Changing the config format or user-facing model selection UX
- Adding a plugin system for third-party model providers
- Modifying how `pi-ai`'s `getModel()` works
- Supporting dynamic/runtime model registration (still compile-time)

## Decisions

### 1. Module structure: `src/models/`

```
src/models/
  index.ts        — barrel export: resolveModel, getThinkingLevel, registerProvider
  registry.ts     — ModelRegistry class (singleton), resolve logic
  qwen.ts         — QWEN_MODELS, DASHSCOPE_BASE, buildQwenModel
  deepseek.ts     — (future) DeepSeek-specific overrides if needed
```

**Rationale**: One file per provider keeps things manageable. The barrel `index.ts` exposes only what `harness.ts` and `config.ts` need.

### 2. Resolution order: pi-ai first, registry fallback

```typescript
function resolveModel(provider: string, modelId: string): Model<Api> {
  // 1. Try pi-ai's built-in getModel
  const builtin = getModel(provider, modelId);
  if (builtin) return builtin;
  // 2. Fall back to registered provider definitions
  return registry.resolve(provider, modelId);
}
```

**Rationale**: `pi-ai` already knows about DeepSeek, OpenAI, Anthropic, etc. We only need custom definitions for providers not in pi-ai (Qwen). This avoids duplicating definitions pi-ai already has.

**Alternative considered**: Replace pi-ai's `getModel` entirely with our own registry. Rejected — would require maintaining definitions for all providers, duplicating pi-ai's work and risking drift.

### 3. Thinking-level: model metadata, not harness heuristic

Each model definition gets an optional `recommendedThinkingLevel` field. The registry exposes `getThinkingLevel(provider, modelId)` that returns the recommendation or falls back to a simple heuristic (reasoning models → "high", others → "off").

**Rationale**: Currently the same heuristic appears in both `harness.ts:351` and `config.ts:179`. Centralizing it eliminates duplication and makes it override-able per model.

### 4. Singleton registry

`ModelRegistry` is a module-level singleton, initialized eagerly with built-in providers. No DI or constructor injection needed.

**Rationale**: Model definitions are static data, not stateful resources. A singleton avoids threading a registry instance through the harness constructor. If we ever need test isolation, we can add a `resetForTest()` method.

## Risks / Trade-offs

- **Risk**: pi-ai updates its model definitions and our fallback becomes stale or conflicting. → **Mitigation**: pi-ai always takes priority in resolution. Our definitions are only for providers pi-ai doesn't know about.
- **Risk**: The `recommendedThinkingLevel` field adds a non-standard property to model definitions. → **Mitigation**: It's stored separately in the registry, not on the `Model<Api>` type itself. No type pollution.
- **Trade-off**: More files for a relatively small amount of code (~60 lines). → Acceptable because it establishes a pattern for future providers and improves testability.
