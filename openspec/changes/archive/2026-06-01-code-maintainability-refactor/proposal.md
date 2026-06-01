## Why

The codebase has accumulated architecture debt that dramatically increases debugging costs: a recent 350-message, ~314K-token debugging session for a simple image-processing bug exposed systemic issues — God classes (Harness 1171 lines, TuiApp 1031 lines), fragmented image processing across 8 files, 44 `as any` casts in WebUiBackend, a mockTui stub necessitated by slash-command coupling, and dual-track MCP-vs-user image pipelines that don't share error handling. This refactoring addresses the root causes identified in the maintainability analysis to reduce future debugging costs by an estimated 5-7x.

## What Changes

- **Introduce `HarnessAPI` interface**: A public contract exposing agent, managers, imagePipeline, and mutation methods. Replaces the 20-field `TuiDeps` and eliminates 44 `as any` casts in `web-backend.ts`.
- **Extract `ImagePipeline` as an independent module**: Consolidate image reading, caching, OCR, vision, and orchestration from 8 scattered files into `src/image-pipeline/`. Both user images and MCP tool images flow through the same pipeline.
- **Unify MCP image processing with ImagePipeline**: MCP `buildAgentTool` delegates to `ImagePipeline.process()` instead of duplicating compression + vision logic. Eliminates the dual-track problem (different error handling, wasted base64 tokens, duplicated code).
- **Decouple slash commands from TuiApp**: `SlashCommandContext` depends on `{ harness: HarnessAPI, ui: UiBackend }` instead of requiring `TuiApp`. Removes the 10-stub `mockTui` in `web-backend.ts` (**BREAKING** for slash command implementations).
- **Add `display` field to WebSocket info protocol**: Server events specify `display: "toast" | "panel"` explicitly instead of relying on frontend string heuristics.
- **Add tests for ImagePipeline core paths**: Vision→OCR fallback, empty-description detection, OCR failure protection.
- **Split God classes**: Harness delegates to ImagePipeline and shrinks to ~300 lines. TuiApp extracts ImagePasteHandler, McpBrowserPanel, PermissionDialog.

## Capabilities

### New Capabilities
- `harness-api`: Public HarnessAPI interface replacing TuiDeps; unified constructor pattern for TuiBackend and WebUiBackend
- `image-pipeline`: Unified image processing module (reader, cache, OCR, vision, orchestration) consumed by both user-input and MCP-tool-result paths
- `slash-command-context`: Decoupled slash command dependency model based on `{ harness, ui }` instead of `TuiApp`

### Modified Capabilities
- `core-harness`: Harness class shrinks; exposes HarnessAPI; delegates image work to ImagePipeline
- `ui-backend`: UiBackend interface gains HarnessAPI reference; TuiDeps eliminated
- `vision-pipeline`: Vision model orchestration moves from harness.ts into ImagePipeline module
- `mcp-image-tool-result`: MCP image processing delegates to ImagePipeline.process() instead of inline compression+vision
- `websocket-protocol`: Server-to-client info events gain explicit `display` field
- `image-cache`: ImageCache becomes a sub-module of ImagePipeline (no public API change)
- `image-session`: Session image save/load unified through ImagePipeline types

## Impact

- **Affected files**: `src/core/harness.ts` (major reduction), `src/ui/tui-app.ts` (extract sub-modules), `src/ui/web/web-backend.ts` (remove 44 `as any`, remove mockTui), `src/ui/tui-backend.ts` (simplify construction), `src/mcp/manager.ts` (delegate to ImagePipeline), `src/core/slash/` (new context type), `src/ui/shared/types.ts` (consolidate image types), `web/src/components/App.tsx` (use `display` field), `src/image-pipeline/` (new directory)
- **Breaking changes**: Slash command `CommandContext` replaces `tui: TuiApp` with `harness: HarnessAPI, ui: UiBackend`; mockTui removed; TuiDeps type deleted
- **Risk**: Medium — the change touches core infrastructure but is mechanical in nature (extract, delegate, unify). Backward compatibility can be maintained through adapter types during transition
