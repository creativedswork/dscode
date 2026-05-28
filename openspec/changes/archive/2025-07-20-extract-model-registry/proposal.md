## Why

`src/core/harness.ts` currently hardcodes all model definitions (QWEN_MODELS, buildQwenModel, resolveModel) inline, mixing model registry concerns with agent orchestration. As we add more providers and models, this will bloat the harness and make model management harder to test, extend, and maintain independently.

## What Changes

- Extract `QWEN_MODELS`, `DASHSCOPE_BASE`, and `buildQwenModel` from `harness.ts` into a new `src/models/` module
- Extract `resolveModel` logic from the `Harness` class into the models module as a standalone function
- Introduce a provider-agnostic `ModelRegistry` abstraction that supports registering model definitions and resolving models by provider + id
- Move the thinking-level auto-selection heuristic (`provider === "qwen"` etc.) from `harness.ts` into the models module alongside model metadata
- Keep `Harness` using the new module — no public API changes, no **BREAKING** changes
- Make it easy to add new providers/models by simply registering them (no harness edits needed)

## Capabilities

### New Capabilities
- `model-registry`: Centralized model definitions, resolution, and metadata (context window, reasoning support, base URL, etc.) independent of the agent harness

### Modified Capabilities
<!-- None — this is a pure internal refactor, no spec-level behavior changes -->

## Impact

- `src/core/harness.ts`: ~60 lines removed (model definitions + resolveModel), replaced by a single import
- New files: `src/models/registry.ts`, `src/models/qwen.ts`, `src/models/index.ts`
- `src/core/config.ts`: thinking-level default logic may reference the new module instead of inline heuristics
- No external API or config format changes
