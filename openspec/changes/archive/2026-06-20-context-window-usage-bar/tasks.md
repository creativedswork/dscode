## 1. Shared types & protocol

- [x] 1.1 Add `ContextWindowData` interface and `context_window` variant to `ServerEvent` union in `src/ui/shared/types.ts`
- [x] 1.2 Add `UsageCategory` enum or type to `src/context/manager.ts` with members: system, user, thinking, fileRead, fileEdit, terminal, browser, other

## 2. Backend — context estimation

- [x] 2.1 Add `getCategoryBreakdown(messages: unknown[], tools: ToolCallEntry[])` method to `ContextManager` in `src/context/manager.ts` that returns `{ total, used, free, categories }` using `estimateTokens`
- [x] 2.2 Implement tool-call category classification: match tool name prefixes (`read_file` → fileRead, `write_file` / `edit` → fileEdit, `bash` / `shell` → terminal, `browser_*` → browser, fallback → other)
- [x] 2.3 Add `getContextWindow()` accessor to `ContextManager` for the current model's context window size
- [x] 2.4 Export `estimateMessagesTokens` or provide access via `ContextManager` so `WebUiBackend` can get the message-level token estimates for system/user messages

## 3. Backend — broadcast logic

- [x] 3.1 Add `broadcastContextWindow()` private method to `WebUiBackend` that builds the `ContextWindowData` payload and broadcasts it
- [x] 3.2 Add throttled broadcast helper in `WebUiBackend` (500ms throttle, bypass on turn-end flag)
- [x] 3.3 Call `broadcastContextWindow()` on: `ready` (after initial state sync), each `tool_end` (throttled), `assistant_end` (always), `clear_conversation`
- [x] 3.4 Handle edge case: context window size unknown (`getContextWindow()` returns 0) → skip broadcast (no bar to show)

## 4. Frontend — CSS custom properties

- [x] 4.1 Add `--cw-*` custom properties to `:root` and `.dark` blocks in `web/src/index.css` for all 8 category colors
- [x] 4.2 Set warm-theme-appropriate colors: system = color-text-muted, user = color-accent, thinking = muted violet, fileRead = amber-yellow, fileEdit = blue, terminal = red, browser = purple, other = gray

## 5. Frontend — ContextWindowBar component

- [x] 5.1 Create `web/src/components/ContextWindowBar.tsx` with props: `data: ContextWindowData | null`
- [x] 5.2 Implement the segmented horizontal bar using `<div>` segments with percentage widths, each referencing `var(--cw-<category>)` for background
- [x] 5.3 Implement the numerical summary label ("8.2k / 128k") using a `formatTokenCount` helper (round to 1 decimal for thousands)
- [x] 5.4 Implement hover tooltip showing per-category breakdown with category names, token counts, and color dots
- [x] 5.5 Implement minimum 2px segment width for tiny non-zero categories
- [x] 5.6 Return `null` when `data` prop is null (no data yet)

## 6. Frontend — App.tsx integration

- [x] 6.1 Import `ContextWindowBar` component and `ContextWindowData` type in `App.tsx`
- [x] 6.2 Add `contextWindow` state (`useState<ContextWindowData | null>(null)`)
- [x] 6.3 Handle `context_window` event in `handleEvent` switch: update `contextWindow` state
- [x] 6.4 Modify header JSX: convert to three-zone flexbox layout (left / center / right), insert `<ContextWindowBar data={contextWindow} />` in center zone
- [x] 6.5 Add responsive hide: `hidden md:flex` on the center zone wrapper to hide bar below 768px

## 7. Validation

- [x] 7.1 Run `npm run typecheck` and fix any type errors
- [x] 7.2 Run `npm test` and ensure existing tests pass
- [x] 7.3 Manual smoke test: start `npm start -- --web`, send messages, verify bar appears in header center and updates
- [x] 7.4 Manual dark mode test: toggle theme, verify bar colors switch correctly
- [x] 7.5 Manual mobile test: resize to <768px, verify bar hides and header layout remains functional
