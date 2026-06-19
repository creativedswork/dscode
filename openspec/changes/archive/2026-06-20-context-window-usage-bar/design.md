## Context

The WebUI currently has a simple header with "DSCode" branding on the left, a model name label, and a theme toggle + connection status on the right. The center of the header is empty. Users have no visibility into their context window budget — how much of the model's token limit is occupied vs. free, or what categories of content consume tokens.

The `ContextManager` (`src/context/manager.ts`) already estimates total message tokens via `estimateMessagesTokens()` and uses that for compaction (`drop-oldest`, `sliding-window`). However, this estimation is aggregate-only; no per-category breakdown exists. The `WebUiBackend` tracks tool calls in `currentAssistant.tools` but doesn't expose token counts to the frontend.

The Cline extension popularized the "context window bar" UX — a compact horizontal bar showing per-category token usage with color coding. We adopt the same pattern but integrate it into dscode's warm flat-design aesthetic and the existing WebSocket event model.

**Constraints:**
- Must work within the existing warm design system (no new design language)
- Must not add external dependencies
- Must reuse existing `estimateTokens` infrastructure
- Must handle both light and dark themes via CSS custom properties
- Bar must fit comfortably in the header center without crowding other elements

## Goals / Non-Goals

**Goals:**
- Show a real-time, segmented horizontal bar in the WebUI header center representing context window usage
- Color-code segments by content category: system prompt, user messages, thinking, tool calls (file read, file edit, terminal, browser), and free space
- Display a compact numerical summary (e.g. `8.2k / 128k tokens`)
- Update the bar after each turn completes and periodically during long streaming turns
- Use the warm design system's existing CSS custom property infrastructure

**Non-Goals:**
- Adding context window usage to the TUI (this is WebUI-only)
- Historical context window charts or analytics
- Customizable category colors via settings
- Per-session context window history
- Compaction trigger recommendations or warnings (just visualization)

## Decisions

### 1. Per-category token estimation lives in `ContextManager`

**Decision:** Extend `ContextManager` with a `getCategoryBreakdown(messages, tools)` method that returns estimates per category. The method iterates raw messages plus the current turn's tool calls and classifies each into a category enum.

**Rationale:** Token estimation logic already lives here. Keeping it centralized avoids duplicating the CJK-aware estimation formula. The method accepts tool calls as a separate parameter because tool calls are tracked in `WebUiBackend.currentAssistant.tools`, not in the raw message array.

**Alternatives considered:**
- Putting estimation in `WebUiBackend`: Rejected — would duplicate estimator logic and create a second source of truth.
- Putting estimation in the frontend: Rejected — the frontend doesn't have raw message content after server-side formatting, and estimating on the frontend would be inaccurate for CJK text.

### 2. New `context_window` ServerEvent

**Decision:** Add a new `context_window` event to the `ServerEvent` union:

```typescript
{ type: "context_window"; total: number; used: number; free: number; 
  categories: { system: number; user: number; thinking: number;
                fileRead: number; fileEdit: number; terminal: number; 
                browser: number; other: number } }
```

**Rationale:** A dedicated event type is cleaner than piggybacking on `ready` or `sessions`. It's sent independently and can be throttled without affecting other event streams. The category breakdown uses fixed keys so the frontend can reference them directly without string parsing.

**Alternatives considered:**
- Piggyback on `sessions` event: Rejected — `sessions` is already data-heavy and sent for session list changes, not context changes.
- Piggyback on `assistant_end`: Rejected — we also want updates during long turns (at each tool_end).
- Generic payload like `Record<string, number>`: Rejected — fixed keys give TypeScript type safety.

### 3. Broadcast timing: throttled, not on every event

**Decision:** The backend broadcasts `context_window` on these triggers, throttled to at most once per 500ms:
- On `ready` (initial connect / re-sync)
- After each `tool_end` (tool call accumulated), throttled
- After `assistant_end` (turn complete), always sent
- After `clear_conversation`, always sent

**Rationale:** Sending on every `text_delta` would flood the WS connection (streaming can produce hundreds of deltas per second). 500ms throttle during streaming + always-on-turn-end ensures the bar is responsive but not wasteful. The bar's visual update is smooth enough at 2 FPS.

### 4. Frontend component: `ContextWindowBar`

**Decision:** A standalone React component that receives the `context_window` event data as props and renders a horizontal segmented bar. The component:
- Stores the latest `ContextWindowData` in state (set via `App.tsx` event handler)
- Renders nothing (returns null) when no data is available yet
- Renders the bar using inline `style` props referencing CSS custom properties (matching the existing warm design pattern)
- Shows a tooltip on hover with the full per-category breakdown

**Rationale:** Keeping it as a single component with a focused concern (context visualization) follows the project's "one file, one responsibility" rule. Using inline styles with CSS custom properties maintains consistency with the rest of the codebase.

### 5. Color palette for categories

**Decision:**
| Category | Light theme | Dark theme | Meaning |
|----------|------------|------------|---------|
| system | `#8a8580` | `#8a8580` | var(--color-text-muted) |
| user | `#ca8a04` | `#d49708` | var(--color-accent) |
| thinking | `#a78bfa` | `#7c6bb0` | muted violet |
| fileRead | `#eab308` | `#ca8a04` | amber-yellow |
| fileEdit | `#3b82f6` | `#60a5fa` | blue |
| terminal | `#ef4444` | `#f87171` | red |
| browser | `#8b5cf6` | `#a78bfa` | purple |
| other | `#6b7280` | `#9ca3af` | gray |
| free | transparent | transparent | background shows through |

Defined as new CSS custom properties on `:root` and `.dark`: `--cw-system`, `--cw-user`, etc. This maintains the warm design system pattern and ensures theme transitions work automatically.

### 6. Header layout: flexbox with three zones

**Decision:** Modify the `<header>` in `App.tsx` from a two-zone layout (justify-between left/right) to a three-zone layout: left (branding + model + sidebar toggle), center (ContextWindowBar), right (theme + connection status). The center zone uses `flex: 1` with `justify-content: center` so the bar is naturally centered regardless of left/right content width. On small screens (`<768px`), the bar hides entirely (too narrow to be useful).

## Risks / Trade-offs

- **Token estimation is approximate**: `estimateTokens()` uses character-count heuristics, not actual tokenization. → Mitigation: Bar display labels include a tooltip noting "Estimated" and the numbers are good enough for budget awareness.
- **Bar too wide on narrow viewports**: The header already has several elements. → Mitigation: Hide bar below 768px (matching the existing `md:` breakpoint pattern). The bar only needs ~240px minimum.
- **Category classification is heuristic**: We classify tool calls by name prefix (`read_file`, `write_file`, `bash`, `browser_*`). Future tool names might not match. → Mitigation: Fall back to `other` category for unrecognized tools; easy to extend the pattern matcher.
- **Extra WS traffic**: Each `context_window` event adds ~150 bytes. → Mitigation: Throttled to 500ms during streaming (~300 bytes/sec worst case), negligible vs. the existing delta stream.
