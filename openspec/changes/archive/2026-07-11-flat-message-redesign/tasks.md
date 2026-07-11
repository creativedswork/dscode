## 1. CSS — Flat Message Layout + Tool Cards

- [x] 1.1 Update `index.css`: add `.assistant-msg`, `.user-msg`, `.meta`, `.thinking` styles with warm design system tokens
- [x] 1.2 Add `.tool-card` styles: 6px border-radius, flat surface background, 1px border, hover state, 0.3s max-height transition for body
- [x] 1.3 Add `.tool-card.mcp` variant: 2px accent left border
- [x] 1.4 Add `.mcp-badge` style: 8px uppercase mono, amber bg
- [x] 1.5 Add `.mcp-rich-list` and `.mcp-rich-item` styles: vertical list with title/score/url/content/meta-row
- [x] 1.6 Add `.mcp-raw-block` style: mono font, pre-wrap, 280px max-height scroll
- [x] 1.7 Add `.text-response` style: 15px/1.7 line-height, 85% max-width, code accent style
- [x] 1.8 Remove or archive legacy bubble styles that are fully replaced

## 2. ChatView — Message Structure Refactor

- [x] 2.1 Replace `MessageBubble` component: split into `UserBubble` (keeps bubble-style with `data-collider="message-card"`) and `AssistantMessage` (new flat `.assistant-msg` container)
- [x] 2.2 Add `.meta` row to assistant messages: "dscode" label + timestamp
- [x] 2.3 Replace `ThinkingBlock` `<details>` implementation with `<div class="thinking">` always-visible block with left border and dot indicator label
- [x] 2.4 Ensure `data-collider` attributes are maintained: `message-card` on user bubble, none on `.assistant-msg` (nested colliders handled by children)
- [x] 2.5 Verify `scrollContainerRef` forwarding still works with new structure
- [x] 2.6 Verify `hasStreaming` / streaming state rendering (cursor blink, etc.) works with new structure

## 3. ToolCard — Redesign + MCP Variant

- [x] 3.1 Redesign ToolCard header: status icon + mono tool name + truncated args + chevron
- [x] 3.2 Implement body expand/collapse with `.open` class toggle and 0.3s CSS transition
- [x] 3.3 Add MCP detection: if `tool.name.startsWith('mcp__')`, add `.mcp` class and MCP badge
- [x] 3.4 Implement MCP rich list rendering: parse JSON result, render `.mcp-rich-list` with `.mcp-rich-item` cards
- [x] 3.5 Implement MCP raw block rendering: for non-JSON MCP results, render `.mcp-raw-block`
- [x] 3.6 Ensure all ToolCard elements have correct `data-collider` attributes (`tool-card`, `tool-header`, `tool-result-line`)

## 4. Markdown — Verify Unchanged

- [x] 4.1 Confirm `Markdown.tsx` text-line and code-line `data-collider` wrapping is unchanged
- [x] 4.2 Verify inline code, tables, links, images rendering still works with new `.text-response` container

## 5. TransitionCanvas — Compatibility Verification

- [x] 5.1 Test that `container.querySelectorAll("[data-collider]")` returns correct leaf elements in new DOM structure
- [x] 5.2 Verify thinking block (no data-collider) does not appear as collision target
- [x] 5.3 Verify `.assistant-msg` (no data-collider) is properly skipped by nesting exclusion
- [x] 5.4 Test full cascade animation with new layout — confirm visual quality

## 6. Integration + Polish

- [x] 6.1 Test all three exchanges: simple tool call, edit operation, MCP multi-tool
- [x] 6.2 Verify dark mode compatibility for all new styles
- [x] 6.3 Verify `prefers-reduced-motion` handling (animations disabled)
- [x] 6.4 Run `npm run typecheck` and `npm test`
- [x] 6.5 Manual visual QA: check spacing, typography, hover states, expand/collapse fluidity
