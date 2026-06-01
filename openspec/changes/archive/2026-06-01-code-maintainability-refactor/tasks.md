## 1. Create ImagePipeline module

- [x] 1.1 Create `src/image-pipeline/` directory structure with `index.ts`, `types.ts`, `reader.ts`, `cache.ts`, `ocr.ts`, `vision.ts`, `pipeline.ts`
- [x] 1.2 Define `ImageRef`, `ProcessResult`, `ProgressFn` types in `types.ts`
- [x] 1.3 Move `ImageCache` from `src/utils/image-cache.ts` to `src/image-pipeline/cache.ts`; add re-export shim in old location
- [x] 1.4 Move `image.ts` (file/clipboard reader) to `src/image-pipeline/reader.ts`; add re-export shim in old location
- [x] 1.5 Move `ocr.ts` to `src/image-pipeline/ocr.ts`; add re-export shim in old location
- [x] 1.6 Move `describeImagesViaVisionModel` and `resolveVisionModel` from `harness.ts` to `src/image-pipeline/vision.ts`
- [x] 1.7 Implement `ImagePipeline` class with `process()` method in `pipeline.ts` (vision→OCR fallback orchestration)
- [x] 1.8 Add `onProgress` callback support to `process()` for MCP intermediate state
- [x] 1.9 Write unit tests for `ImagePipeline.process()`: vision success, vision empty → OCR, vision error → OCR, OCR no text, double failure
- [x] 1.10 Run `npx tsc --noEmit` and `npm test` to verify module compiles and tests pass

## 2. Introduce HarnessAPI interface

- [x] 2.1 Define `HarnessAPI` interface in a new file (e.g., `src/core/harness-api.ts`) with readonly agent/managers accessors, `imagePipeline`, and mutation methods
- [x] 2.2 Make `Harness` fields `public readonly`: agent, sessionManager, memoryManager, driverRegistry, toolRegistry, skillManager, permissionManager, contextManager, mcpManager, config, configStore
- [x] 2.3 Add `this.imagePipeline` construction in `Harness` constructor
- [x] 2.4 Add `Harness implements HarnessAPI` declaration
- [x] 2.5 Run `npx tsc --noEmit` to verify no type errors

## 3. Update TuiBackend and WebUiBackend to use HarnessAPI

- [x] 3.1 Remove `TuiDeps` type definition and all imports
- [x] 3.2 Change `TuiBackend` constructor to accept `{ harness: HarnessAPI }` instead of `TuiDeps`
- [x] 3.3 Update all `this.deps.*` in `TuiBackend` / `TuiApp` to `this.harness.*`
- [x] 3.4 Change `WebUiBackend` constructor to accept `{ harness: HarnessAPI, port, config }`
- [x] 3.5 Replace all 44 `(this.harness as any).*` in `web-backend.ts` with direct `this.harness.*` access (44→18, remaining unrelated to harness)
- [x] 3.6 Update `harness.run()` to pass `{ harness: this }` to both TuiBackend and WebUiBackend
- [x] 3.7 Update `main.ts` Web path to pass `{ harness, port, config }` to WebUiBackend consistently
- [x] 3.8 Run `npx tsc --noEmit` and verify zero `as any` casts for harness access in web-backend.ts

## 4. Unify MCP image processing through ImagePipeline

- [x] 4.1 Pass `ImagePipeline` instance to `MCPManager` via constructor parameter
- [x] 4.2 Remove `visionResolve` and `visionDescribe` public callback fields from `MCPManager`
- [x] 4.3 Remove `visionResolve`/`visionDescribe` assignments in `harness.run()` and `harness.updateProjectPath()`
- [x] 4.4 Update `buildAgentTool().execute()` to call `this.imagePipeline.process()` instead of inline compression + vision
- [x] 4.5 Use `onProgress` callback in MCP path for intermediate UI updates (replaces old `onUpdate`)
- [x] 4.6 Ensure MCP tool result excludes base64 images when main model doesn't support image input
- [x] 4.7 Run `npx tsc --noEmit` and verify MCP image flow compiles

## 5. Decouple slash commands from TuiApp

- [x] 5.1 Define `SlashCommandContext` interface: `{ harness: HarnessAPI, ui: UiBackend }`
- [x] 5.2 Update `executeSlashCommand` signature to accept `SlashCommandContext`
- [x] 5.3 Update all slash command implementations: `ctx.agent` → `ctx.harness.agent`, `ctx.tui.*` → `ctx.ui.*`, etc.
- [x] 5.4 Remove `mockTui` object and all its stub methods from `web-backend.ts`
- [x] 5.5 Update TUI slash command call site to pass `{ harness: this.harness, ui: this.tui }` (or equivalent)
- [x] 5.6 Update Web slash command call site to pass `{ harness: this.harness, ui: this }`
- [x] 5.7 Verify no file imports `TuiApp` from slash command code
- [x] 5.8 Run `npx tsc --noEmit` and test `/help`, `/config`, `/reset` in both TUI and Web modes

## 6. Add display field to WebSocket info protocol

- [x] 6.1 Add `display: "toast" | "panel"` to the info `ServerEvent` type in `src/ui/web/protocol.ts`
- [x] 6.2 Update all server-side `addInfo()` calls to include appropriate `display` value based on semantic intent (single-line → toast, multi-entry listing → panel)
- [x] 6.3 Update `WebUiBackend.addInfo()` to accept or infer `display` mode
- [x] 6.4 Update frontend `App.tsx` to route by `event.display` instead of string heuristics
- [x] 6.5 Remove string-heuristic routing code (`txt.includes("\n")`, `startsWith("Available")`, etc.)
- [x] 6.6 Run `npx tsc --noEmit` and manually test info messages in Web UI

## 7. Split God classes (TuiApp extraction)

- [x] 7.1 Extract `ImagePasteHandler` from `tui-app.ts` into `src/ui/image-paste-handler.ts`
- [x] 7.2 Extract `McpBrowserPanel` from `tui-app.ts` into `src/ui/mcp-browser-panel.ts` (or consolidate with existing `mcp-browser.ts`)
- [x] 7.3 Extract `PermissionDialog` from `tui-app.ts` into `src/ui/permission-dialog.ts`
- [x] 7.4 Verify `tui-app.ts` is under 400 lines after extraction
- [x] 7.5 Run `npx tsc --noEmit` and verify TUI still works

## 8. Final verification and cleanup

- [x] 8.1 Run full type check: `npx tsc --noEmit` — must pass with zero errors
- [x] 8.2 Run tests: `npm test` — all existing and new ImagePipeline tests must pass
- [x] 8.3 Verify `web-backend.ts` has zero `as any` casts for harness access
- [x] 8.4 Verify `TuiDeps` type is fully removed from codebase
- [x] 8.5 Verify `mockTui` is fully removed from `web-backend.ts`
- [x] 8.6 Verify `visionResolve`/`visionDescribe` fields removed from `MCPManager`
- [x] 8.7 Verify `harness.ts` is approximately 300 lines (or under 400)
- [x] 8.8 Manual smoke test: TUI mode (paste image, send message, verify vision/OCR flow)
- [x] 8.9 Manual smoke test: Web mode (upload image, send message, verify info toasts/panels, slash commands)
- [x] 8.10 Manual smoke test: MCP tool returning images (verify images processed, no base64 garbage to non-vision models)
