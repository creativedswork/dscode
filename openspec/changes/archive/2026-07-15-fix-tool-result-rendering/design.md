## Context

The Web UI ToolCard component has two rendering paths for tool results:
1. **Built-in tools** (non-MCP): results go through `formatToolResultForUI` → `<Markdown>` component
2. **MCP tools**: JSON results → `RichListItem` cards; non-JSON results → `mcp-raw-block` plain text

A previous fix (whole `<Markdown>` instead of line-by-line split) was applied, but the rendering is still broken because the CSS container `.tool-card-body-inner` sets `font-family: monospace`, `color: muted`, `white-space: pre-wrap` which are **inherited** by the `<Markdown>` component's `<pre>` and `<p>` elements. This causes:
- Code blocks to wrap instead of scroll (inherited `pre-wrap`)
- All text to appear muted gray (inherited `color`)
- All text to appear monospace (inherited `font-family`)
- JSON structure lost when `pre-wrap` collapses pretty-printed newlines into wrapping

Additionally, `DEFAULT_MAX_CHARS = 600` in `formatToolResultForUI` truncates pretty-printed JSON mid-object, and MCP `mcp-raw-block` uses `{tool.result}` (plain text) instead of `<Markdown>`.

## Goals / Non-Goals

**Goals:**
- Built-in tool results render with proper code blocks (horizontal scroll, correct font/color)
- MCP non-JSON tool results render as Markdown (headings, lists, code blocks, inline code)
- JSON tool results are readable (pretty-printed, not truncated mid-object)
- No blank space inside tool cards

**Non-Goals:**
- Changing the rich list rendering for MCP JSON results (already works well)
- Adding syntax highlighting to code blocks (ReactMarkdown doesn't support this without additional plugins)
- Changing the tool card expand/collapse interaction
- Changing the `formatToolResultForUI` tool-specific formatting logic (bash→sh, grep→json, etc.)

## Decisions

### Decision 1: Remove conflicting CSS properties from container, let Markdown own styling

**Rationale**: The `<Markdown>` component already has custom `pre`, `code`, and `p` overrides with proper styling. The container's CSS properties were designed for the old line-by-line plain text rendering and are now harmful when Markdown handles rendering.

**Alternative considered**: Override `white-space: pre` on the Markdown component's `<pre>` element directly. Rejected because it only fixes one symptom — the `font-family`, `color`, and `font-size` conflicts would remain.

**Properties removed from `.tool-card-body-inner`**: `font-family`, `font-size`, `line-height`, `color`, `white-space`, `word-break`
**Properties kept**: `padding`, `border-top`, `margin-top`, `max-height`, `overflow-y`

### Decision 2: MCP raw block uses `<Markdown>` instead of plain text

**Rationale**: MCP tools can return Markdown-formatted text (e.g. file contents from `get_file`). Rendering as plain text shows literal `\n` and loses all formatting. Using `<Markdown>` brings parity with built-in tools.

**Alternative considered**: Keep plain text but add `white-space: pre-wrap` to preserve newlines. Rejected because it doesn't render headings, code blocks, or inline code — MCP results that contain Markdown would look raw.

### Decision 3: Raise `DEFAULT_MAX_CHARS` from 600 to 2000

**Rationale**: Pretty-printed JSON with 2-space indentation easily exceeds 600 chars for moderate objects. 2000 chars allows most tool results to display fully without truncation. The truncation hint (`… (N more chars)`) is preserved for results exceeding the limit.

**Alternative considered**: Remove truncation entirely. Rejected because very large tool results (e.g. `read_file` on a 10k-line file) would create unmanageable DOM size.

### Decision 4: Reduce `<pre>` margin from `my-2` (8px) to 4px

**Rationale**: Inside a compact tool card, 16px total vertical margin on `<pre>` creates visible blank space. 4px (8px total) is enough visual separation without wasting space.

### Decision 5: Raise `.tool-card-body-inner` max-height from 320px to 400px

**Rationale**: With the larger char limit (2000), results may be taller. 400px provides headroom while still scrolling for very long results.

## Risks / Trade-offs

- **[Risk] Removing `white-space: pre-wrap` from container may affect non-Markdown text** → Mitigation: The built-in tool path now exclusively uses `<Markdown>`, which handles its own whitespace. No plain text is rendered directly in `.tool-card-body-inner`.

- **[Risk] MCP raw block with Markdown may render unexpected content** → Mitigation: MCP results that are pure text will render as paragraphs, which is acceptable. The `RichListItem` path is unchanged for JSON results.

- **[Risk] Larger char limit may increase DOM size** → Mitigation: 2000 chars is still bounded; the `max-height: 400px` + `overflow-y: auto` ensures the card doesn't grow unbounded.

- **[Trade-off] No syntax highlighting** → Code blocks render as plain monospace text without token coloring. Acceptable — adding a syntax highlighter (e.g. `react-syntax-highlighter`) is a separate concern.
