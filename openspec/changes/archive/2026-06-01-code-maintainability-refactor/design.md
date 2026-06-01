## Context

The DSCode codebase has evolved rapidly and accumulated architecture debt. A recent debugging session (350 messages, ~314K tokens) for a simple image-processing bug exposed systemic issues. The maintainability analysis identified 9 root causes with 8 concrete symptoms. This design addresses the highest-priority structural problems.

**Current state summary:**
- `Harness` (1171 lines) is a God class holding 10+ managers plus the image pipeline
- `TuiDeps` (20 fields) is manually constructed inside `harness.run()`; `WebUiBackend` uses `harness` directly but accesses private fields via 44 `as any` casts
- Image processing logic is scattered across 8 files with MCP images and user images following completely separate code paths
- Slash commands depend on `TuiApp` concrete class, forcing `WebUiBackend` to maintain a `mockTui` with 10 stub methods
- Web frontend uses string heuristics (`txt.includes("\n")`, `txt.startsWith("Available")`) to route info messages between toast and panel

## Goals / Non-Goals

**Goals:**
1. Eliminate `TuiDeps` and introduce `HarnessAPI` — a single public interface consumed by both TUI and Web backends
2. Extract `ImagePipeline` as an independent module — consolidate 8 scattered files into `src/image-pipeline/`
3. Unify MCP image processing through `ImagePipeline.process()` — same vision→OCR fallback, same error handling, same model-capability checks
4. Decouple slash commands from `TuiApp` — replace `CommandContext.tui: TuiApp` with `{ harness: HarnessAPI, ui: UiBackend }`
5. Add `display` field to WebSocket info protocol — eliminate frontend string heuristics
6. Reduce `harness.ts` to ~300 lines of pure orchestration
7. Eliminate all 44 `as any` casts in `web-backend.ts`

**Non-Goals:**
- Introducing `Result<T, E>` type (low priority per analysis §7; deferred to follow-up)
- Unifying image types (ImageContent/ImageRef/ImageAttachment consolidation deferred)
- Session storage image path simplification (deferred)
- CI gates (`npm test` in PR) — infra concern, not code refactor
- Changing the external API surface of pi-agent-core integration

## Decisions

### D1: HarnessAPI as a TypeScript interface (not abstract class)

**Decision**: Define `HarnessAPI` as a TypeScript `interface` with readonly properties and method signatures. Both `TuiBackend` and `WebUiBackend` receive it via constructor: `new TuiBackend({ harness: HarnessAPI })`.

**Rationale**: An interface allows the actual `Harness` class to implement it directly without an adapter layer. The `Harness` class already has these fields and methods — they just need to be made `public` (or `public readonly`) instead of `private`. No runtime overhead.

**Alternatives considered**:
- *Abstract class*: Would require Harness to `extend` it, limiting flexibility. Rejected.
- *Adapter/wrapper per backend*: Unnecessary indirection. Rejected.
- *Keep TuiDeps as-is*: The status quo is the problem. Rejected.

### D2: ImagePipeline as a standalone class injected into Harness

**Decision**: Create `src/image-pipeline/pipeline.ts` exporting `class ImagePipeline` with a single primary method `process(images: ImageContent[], text: string): Promise<{ enrichedText: string; cachedRefs: ImageRef[] }>`. Harness instantiates it once in the constructor and exposes it via `harness.imagePipeline`.

**Rationale**: ImagePipeline is a self-contained concern — it needs config (vision model, API key), an `onWarning` callback for UI feedback, and access to ImageCache. By making it a standalone class, it can be tested independently of Harness and reused by both user-input and MCP-tool-result paths.

**Module structure**:
```
src/image-pipeline/
├── index.ts          — barrel export
├── types.ts          — ImageContent, ImageRef, ProcessResult
├── reader.ts         — readImageFromFile, readImageFromClipboard (from image.ts)
├── cache.ts          — ImageCache (from utils/image-cache.ts)
├── ocr.ts            — ocrImages (from utils/ocr.ts)
├── vision.ts         — describeImagesViaVisionModel (from harness.ts)
├── pipeline.ts       — ImagePipeline.process() orchestration
└── pipeline.test.ts  — core path tests
```

**Alternatives considered**:
- *Keep in Harness as private methods*: Prevents reuse by MCP path. Rejected.
- *Make it a set of pure functions*: Harder to inject config and mock in tests. Rejected.

### D3: MCP image processing delegates to ImagePipeline (not inline)

**Decision**: `MCPManager.buildAgentTool().execute()` calls `this.imagePipeline.process(imageBlocks, "")` instead of its current inline compression + vision flow. The `visionResolve` and `visionDescribe` callback fields on MCPManager are **removed**. MCPManager receives `ImagePipeline` via constructor or setter.

**Rationale**: This eliminates the dual-track problem (analysis §3.4.3). MCP images now get the same vision→OCR→fallback chain, same error handling, same model-capability check (no base64 passed to models that don't support images). The `onUpdate` intermediate state can be handled by a callback parameter to `process()`.

**Alternatives considered**:
- *Have ImagePipeline expose separate `compress` and `describe` methods, letting MCPManager orchestrate*: Still leaves orchestration logic duplicated. Rejected.
- *Keep current callback injection but add ImagePipeline as the callback*: Just moves the problem. Rejected.

### D4: SlashCommandContext = { harness, ui } (remove TuiApp dependency)

**Decision**: Redefine `CommandContext` (or introduce `SlashCommandContext`) as:
```typescript
interface SlashCommandContext {
  harness: HarnessAPI;
  ui: UiBackend;
}
```
All slash command `execute` functions receive this instead of the current `CommandContext` + `tui: TuiApp`. The current `CommandContext` fields that come from Harness (agent, sessionManager, etc.) are accessed via `context.harness`.

**Rationale**: `TuiApp` is a TUI-specific implementation detail. Slash commands that need UI feedback (addInfo, addError, getPromptPermission) can get it from `ui: UiBackend`. This eliminates the `mockTui` in `web-backend.ts` entirely.

**Alternatives considered**:
- *Keep CommandContext but make tui optional*: Still couples the type to TuiApp. Rejected.
- *Separate SlashUI interface*: Would be a third thing alongside UiBackend. Rejected.

### D5: WebSocket info events gain explicit `display` field

**Decision**: Change server-to-client info events from `{ type: "info", text: string }` to `{ type: "info", text: string, display: "toast" | "panel" }`. Server code explicitly chooses the display mode. Frontend matches on `event.display` directly.

**Rationale**: This eliminates the fragile string heuristics in `web/src/components/App.tsx` L82-89. The server knows the semantic intent — whether the message is a single-line notification or a multi-entry listing — and should communicate it explicitly.

### D6: Harness reduction through delegation (not inheritance)

**Decision**: Harness keeps its 10 manager fields but delegates image work to `this.imagePipeline`. The `promptWithImages`, `resolveVisionModel`, `describeImagesViaVisionModel` methods are replaced by thin wrappers around `this.imagePipeline`.

**Rationale**: Harness is still the central coordinator — it wires managers together. The goal is not to eliminate Harness but to shrink it by extracting coherent sub-responsibilities. ImagePipeline is the first and most impactful extraction.

## Risks / Trade-offs

- **[Risk] Breaking slash command API**: All slash command implementations must update their `CommandContext` usage. → **Mitigation**: Mechanical change — find all `ctx.tui.` → `ctx.ui.` and `ctx.agent` → `ctx.harness.agent`. Can be done with find-replace.
- **[Risk] ImagePipeline API may not cover all MCP edge cases**: MCP images have an `onUpdate` intermediate state that user images don't. → **Mitigation**: Add optional `onProgress` callback to `ImagePipeline.process()`.
- **[Risk] HarnessAPI may grow too large**: If HarnessAPI exposes too many things, it becomes a new God interface. → **Mitigation**: Group related capabilities (e.g., `harness.session`, `harness.config`) rather than flat-listing all fields. Review after extraction.
- **[Trade-off] Test coverage depends on ImagePipeline extraction**: The analysis calls for tests on vision→OCR fallback. These become possible only after ImagePipeline is standalone. → Tests are written as part of the ImagePipeline module creation, not before.

## Migration Plan

1. **Create `src/image-pipeline/` module** — move files, adjust imports, add tests. Existing code continues to work via re-exports from old locations.
2. **Introduce `HarnessAPI`** — make Harness fields `public readonly`, create the interface, update `TuiBackend` and `WebUiBackend` constructors.
3. **Update MCPManager** — inject ImagePipeline, remove `visionResolve`/`visionDescribe` fields, delegate `buildAgentTool` image handling.
4. **Decouple slash commands** — introduce `SlashCommandContext`, update all implementations, remove `mockTui`.
5. **Add WebSocket `display` field** — update server emit and frontend handler.
6. **Remove TuiDeps** — delete the type and the 20-field construction in `harness.run()`.
7. **Clean up** — remove old re-exports, verify 0 `as any` in web-backend.ts.

Each step is independently shippable and can be merged incrementally.
