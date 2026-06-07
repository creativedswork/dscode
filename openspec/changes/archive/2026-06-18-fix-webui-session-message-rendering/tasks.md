## 1. Core: Extract tool calls and thinking from AssistantMessage

- [x] 1.1 Add `extractToolsFromContent(content: any[]): ToolCallEntry[]` helper that iterates `AssistantMessage.content` blocks, collecting `type === "toolCall"` into `{ name, args: JSON.stringify(arguments).slice(0, 80), result: "", isError: false }` entries
- [x] 1.2 Add `extractThinkingFromContent(content: any[]): string | undefined` helper that collects `type === "thinking"` blocks and joins their `thinking` strings with `"\n\n"`
- [x] 1.3 Integrate both helpers into `rebuildDisplayMessages()` so that for `role === "assistant"` messages, `tools` and `thinking` are populated from content blocks instead of `m.tools` / `m.thinking` passthrough

## 2. ToolResultMessage matching

- [x] 2.1 Convert `rebuildDisplayMessages()` from `messages.map()` to a sequential scan that tracks the most recent `AssistantMessage`'s tool calls by `toolCallId → tool entry index`
- [x] 2.2 When encountering a `ToolResultMessage`, match by `toolCallId` to fill `result` (extracted text from content blocks) and `isError` on the corresponding tool entry; mark the `ToolResultMessage` for exclusion
- [x] 2.3 Unmatched `ToolResultMessage` (no preceding assistant or no matching toolCallId): fall back to emitting as standalone `DisplayMessage` with its text content and `role`

## 3. Edge cases and safety

- [x] 3.1 Defensive checks: verify `m.content` is an array before iterating; verify each block has expected `type` field; skip unknown block types silently
- [x] 3.2 Vision message interaction: ensure vision-related content manipulation (image_description stripping, image cache restoration) still works correctly alongside the new tool/thinking extraction (order: extract thinking/tools first, then apply vision processing)
- [x] 3.3 UserMessage path: verify no regression — `UserMessage` content extraction unchanged, `m.images` passthrough preserved
- [x] 3.4 "System message" path: verify the existing `m.role === "system"` branch still works correctly

## 4. Verify

- [ ] 4.1 Manual test: start dscode in web mode, perform a conversation with MCP tool calls (e.g., `search_tools` + `mcp_lsp_*`), save session, reload page, confirm tool calls render as ToolCards (not empty bubbles)
- [ ] 4.2 Manual test: session with failed tool calls — confirm error indicators (red ✗, error text) render correctly in ToolCards
- [ ] 4.3 Manual test: session with thinking content — confirm thinking blocks render in collapsible `<details>` sections
- [ ] 4.4 Manual test: TUI mode — confirm no regressions in TUI message display (both live streaming and `--history` replay)
- [x] 4.5 Run existing test suite: `npm test` (no new failures — 4 pre-existing failures on develop)
