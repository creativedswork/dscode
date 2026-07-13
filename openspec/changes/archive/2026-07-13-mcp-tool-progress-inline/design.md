## Context

MCP servers emit `notifications/progress` during long-running tool executions (e.g., web search pagination, large data fetches). These progress notifications carry `progressToken`, `progress` (number), `total` (optional), and `message` (optional). The MCPClient already handles these and emits typed events, but `MCPManager` does not forward them to the harness event bus. The WebUI wire protocol has no `tool_progress` event. `ToolCallEntry` has no progress fields. The `ToolCard` component renders tool cards as collapsible panels that show a static `◌` spinner until `tool_end` delivers the full result.

The design goal: pipe MCP progress notifications through the entire stack and render a progress bar *inside* the ToolCard body (when expanded) and a mini bar on the header (when collapsed), using existing `warm-design-system` visual tokens.

## Goals / Non-Goals

**Goals:**
- Surface MCP `notifications/progress` to the WebUI as `tool_progress` events
- Render progress inline within the `ToolCard` component — never as a separate dialog/overlay
- Auto-expand the ToolCard body on first progress notification
- Show a mini progress bar on the collapsed header so state is always visible
- Fade out the progress bar on `tool_end` completion
- Handle indeterminate progress (no `total`) with an animated indeterminate bar
- Follow existing `warm-design-system` tokens for all colors, typography, and shapes
- Work correctly in both light and dark themes

**Non-Goals:**
- Progress for non-MCP tools (built-in tools like `bash`, `read_file` are typically fast enough to not need progress)
- Streaming/partial result accumulation in the rich list (future enhancement)
- Progress notifications sent TO the MCP server (outbound progress tracking)
- TUI progress bar rendering (this change is WebUI-only)
- Changing the `mcpApp` iframe behavior

## Decisions

### Decision 1: New `tool_progress` ServerEvent vs piggybacking on `tool_start`

**Chosen**: New standalone `tool_progress` event: `{ type: "tool_progress", name: string, progress: number, total?: number, message?: string }`

**Alternatives considered**:
- Piggyback on `tool_start` with progress fields — rejected because progress updates are frequent and `tool_start` is a one-time lifecycle event. Mixing concerns violates single-responsibility.
- Generic `mcp:progress` event with server-level granularity — rejected because the UI needs per-tool granularity to update individual ToolCards.

**Rationale**: A dedicated wire event mirrors the MCP protocol's separation of `notifications/progress` from request/response. The `name` field matches `tool_start`/`tool_end` for correlation in the reducer.

### Decision 2: Harness event bridge — new event or reuse?

**Chosen**: Add a new harness event `mcp:tool:progress` with `{ toolName, serverName, progress, total?, message? }`.

**Alternatives considered**:
- Reuse `tool:start`/`tool:end` channel — rejected; the harness event bus is typed and adding new fields to existing events would break consumers.
- Have `MCPManager` directly call `WebUiBackend` — rejected; violates layering. The harness event bus is the designated bridge between core and UI.

**Rationale**: Follows the existing pattern: `mcp:state`, `mcp:browser:open` already exist as harness events for MCP concerns. `WebUiBackend` already subscribes to harness events and translates them to WebSocket broadcasts.

### Decision 3: Reducer strategy — mutate last streaming message's tools array

**Chosen**: In `conversationReducer`, the `tool_progress` case finds the last streaming assistant message, locates the matching `ToolCallEntry` by `name`, and updates its `progress`/`progressTotal`/`progressMessage` fields via array map.

**Alternatives considered**:
- Store progress in a separate `Map<toolName, progress>` in App state — rejected; fragments state that should live with the tool entry.
- Create a new `ToolProgressEntry` array parallel to `tools` — rejected; adds unnecessary coordination between two arrays.

**Rationale**: Minimal change to the reducer. The existing `tool_end` case already does a similar "find by name, update in place via map" pattern. Progress updates are shallow field merges that don't affect message identity.

### Decision 4: Auto-expand behavior on progress

**Chosen**: The ToolCard internally tracks a `userManuallyCollapsed` flag. On first `tool_progress`, set `open = true`. If the user manually collapses, set `userManuallyCollapsed = true`. Subsequent progress updates do NOT re-expand. The mini header bar always shows so the collapsed state is still informative.

**Alternatives considered**:
- Re-expand on every progress update — rejected; would fight the user who intentionally collapsed.
- Never auto-expand — rejected; user wouldn't see the progress bar without clicking.

**Rationale**: Respects user intent after the first interaction. The mini bar on the collapsed header ensures progress is never completely hidden.

### Decision 5: Progress bar visual design

**Chosen**: 
- **Expanded bar**: 4px height, `border-radius: 2px`, track `var(--color-surface-hover)`, fill `var(--color-accent)`, `transition: width 0.3s ease`. Percentage text in `Geist Mono 10px`, `var(--color-text-muted)`. Message text below in `Geist Sans 11px`.
- **Mini bar (header)**: 2px height, ~72px width, track `var(--color-border)`, fill `var(--color-accent)`. Placed between args and arrow. Percentage text in `Geist Mono 9px`.
- **Indeterminate**: A 30%-width accent-colored block slides left-to-right on the track using `@keyframes` with `1.5s` period and `ease-in-out`.
- **Fade-out on completion**: `opacity: 1 → 0` over `600ms ease`, then `display: none`. CSS-only via class toggle.

**Alternatives considered**:
- Use `<progress>` native element — rejected; inconsistent styling across browsers, can't easily match the warm design system.
- Radial/circular progress — rejected; takes too much vertical space in the compact tool card layout.
- Keep progress bar visible after completion — rejected; pure visual noise once the tool is done. Users can see the result.

**Rationale**: All colors use existing `--color-*` custom properties, ensuring automatic light/dark theme adaptation. The 4px/2px sizing matches the existing subtle design language (no chunky bars).

### Decision 6: ToolCard header status icon states

**Chosen**: Three states for the status icon in the header:
1. **Waiting** (tool_start, no progress yet): `◌` with existing `.status.ok` styling
2. **In Progress** (has progress field, result not yet set): `◌` with a CSS rotation animation (spinner effect)
3. **Done** (tool_end, result set): `✓` with existing `.status.ok` styling
4. **Error**: `✗` with existing `.status.err` styling (unchanged)

**Rationale**: The spinner animation on `◌` gives a clear "in progress" signal distinct from "waiting" (static `◌`) and "done" (`✓`).

### Decision 7: Execution Card for in-progress MCP tools

**Chosen**: When an MCP tool is in-progress (`isMcp && !hasResult`), the ToolCard body SHALL render an **Execution Card** — a simple nested card with three elements: status label, progress bar, and elapsed time. The execution card has four sub-states:
1. **Waiting**: tool started, no progress yet → pulsing dot + "Live · waiting" + elapsed time only
2. **Indeterminate**: progress without total → animated indeterminate bar with server message
3. **Determinate progress**: progress with total → percentage bar + server message + elapsed time
4. **Completed**: tool finished → 100% bar, then transition to result display

The Execution Card is ALWAYS shown for in-progress MCP tools (never empty body). Thinking text stays in the original Thinking Block — NOT duplicated into the ToolCard. No new props needed.

**Alternatives considered**:
- Show thinking text inside Execution Card — rejected; model's planning monologue ("Now let me call X...") is noise in execution context, and the Thinking Block already handles this
- Parse tool results for progress fields — rejected; tool result structure is not standardized across MCP servers
- Only show Execution Card when progress exists — rejected; would leave empty body for tools without `notifications/progress`

**Rationale**: Three elements give all the signal with none of the noise. Status tells you what's happening, progress bar shows how far along, elapsed time gives duration context. The always-show policy fixes the empty-body bug. No data plumbing needed beyond existing progress events.

### Decision 8: Auto-expand MCP ToolCards on tool start

**Chosen**: ToolCards for MCP tools (`isMcp`) SHALL auto-expand when first rendered (on `tool_start`), in addition to the existing auto-expand on first `tool_progress`. The `userManuallyCollapsed` flag still suppresses re-expand after manual collapse.

**Rationale**: The Execution Card is the primary source of execution feedback. Auto-expanding ensures the user sees it immediately without needing to click. The existing manual-collapse-respected behavior ensures this doesn't fight the user who intentionally collapses.

## Risks / Trade-offs

- **[Risk] High-frequency progress updates cause React re-renders** → Mitigation: Each update triggers `conversationReducer` which creates a new array via `map`. With typical tool counts (< 5 per turn), this is negligible. The CSS `transition: width 0.3s` naturally smooths visual updates.
- **[Risk] Progress events arrive after `tool_end` (race condition)** → Mitigation: Reducer should only apply progress updates to entries where `result` is still empty. If result is already set, ignore the late progress event.
- **[Risk] MCP server sends progress without `progressToken` matching any pending request** → Mitigation: MCPClient already pairs requests with progress tokens. We forward all progress events; the UI matches by `toolName`. Unmatched progress is silently ignored by the reducer.
- **[Risk] Breaking change to `ToolCallEntry` type used by TUI** → Mitigation: New fields (`progress`, `progressTotal`, `progressMessage`) are optional. TUI code that reads `ToolCallEntry` won't be affected. TUI won't render progress bars (non-goal).

## Open Questions

- Remove the competing `ui:info` toast emission from `handleMcpEvent("progress")` in `harness.ts` (lines 1113-1117). The `mcp:tool:progress` harness event (lines 1120-1127) already delivers progress through the inline ToolCard channel. The toast was the pre-change mechanism and now competes with the inline progress bar.
- **Missing integration point discovered (2026-07-13)**: The `tool_progress` WebSocket event is correctly broadcast by `WebUiBackend` (task 3.2), and `conversationReducer` correctly handles it (task 4.1), but `App.handleEvent` switch-case does NOT include `"tool_progress"` — the event is silently dropped. The reducer never receives progress data, so none of the ToolCard UI renders. Fix: add `"tool_progress"` to the fall-through case group in `web/src/components/App.tsx` alongside `"tool_start"`, `"tool_end"`, `"mcp_app"`.
- **Name mismatch bug discovered (2026-07-13)**: `harness.ts:1117` constructs the `mcp:tool:progress` event's `toolName` as `` `mcp__${event.serverName}_${event.toolName}` `` (single underscore between server and tool). But the MCP tool naming convention in `names.ts:15` (`mcpToolName`) uses double underscore: `mcp__${server}__${tool}`. This causes `t.name === event.name` in `conversationReducer` to **never match** — all progress events are silently dropped. Fix: change to double underscore: `` `mcp__${event.serverName}__${event.toolName}` ``.

