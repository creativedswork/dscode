## Why

Web UI ToolCard renders built-in tool results with broken formatting: JSON appears as a single unbroken line, code blocks lose their structure, and large blank space appears around content. MCP tool results that fall through to the raw block path render as plain text without Markdown. Root cause: CSS properties on `.tool-card-body-inner` (`white-space: pre-wrap`, `font-family: monospace`, `color: muted`) are inherited by the `<Markdown>` component's `<pre>` elements, breaking code block rendering. Additionally, `DEFAULT_MAX_CHARS = 600` truncates pretty-printed JSON mid-object, and MCP `mcp-raw-block` uses `{tool.result}` instead of `<Markdown>`.

## What Changes

- **Strip conflicting CSS from `.tool-card-body-inner`**: Remove `font-family`, `color`, `white-space`, `font-size`, `line-height` — let the `<Markdown>` component own all text styling. Keep `padding`, `border-top`, `max-height`, `overflow-y`.
- **Strip conflicting CSS from `.mcp-raw-block`**: Same cleanup — remove `font-family`, `color`, `white-space`, `word-break`. Let Markdown handle rendering.
- **MCP raw block uses `<Markdown>`**: Change `{tool.result}` to `<Markdown>{tool.result}</Markdown>` so MCP text results get headings, lists, code blocks, and inline code rendering.
- **Raise `DEFAULT_MAX_CHARS` from 600 to 2000**: 600 chars is too small for pretty-printed JSON; mid-object truncation makes output unreadable.
- **Reduce `<pre>` margin in Markdown component**: Change `my-2` (8px top + 8px bottom) to a smaller value to eliminate blank space inside tool cards.
- **Raise `.tool-card-body-inner` `max-height` from 320px to 400px**: Accommodate the larger char limit without excessive truncation.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `tool-result-content-rendering`: Truncation limit changes from 600 to 2000 chars; MCP raw block rendering changes from plain text to Markdown; CSS requirements for `.tool-card-body-inner` and `.mcp-raw-block` updated to remove conflicting properties.

## Impact

- `web/src/index.css` — `.tool-card-body-inner` and `.mcp-raw-block` CSS rules
- `web/src/components/ToolCard.tsx` — MCP raw block rendering path
- `web/src/components/Markdown.tsx` — `<pre>` margin adjustment
- `src/ui/shared/tool-result-formatter.ts` — `DEFAULT_MAX_CHARS` constant
- No API or protocol changes; no breaking changes to external consumers
