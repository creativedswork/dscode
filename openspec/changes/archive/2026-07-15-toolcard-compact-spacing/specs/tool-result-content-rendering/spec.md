## MODIFIED Requirements

### Requirement: ToolCard single Markdown block rendering
The ToolCard component SHALL render the entire formatted tool result as a single `<Markdown>` block rather than splitting by newlines into individual per-line `<Markdown>` components. This ensures that multi-line markdown constructs (code fences, tables, lists) are correctly parsed as complete structures. The `.tool-card-body-inner` container SHALL use ultra-compact spacing: `padding: 2px 14px 6px`, `margin-top: 0`, `background: var(--color-bg)`, and SHALL NOT have a `border-top`. The `background: var(--color-bg)` on the container ensures the padding gap is visually invisible, matching `.mcp-raw-block` behavior. The Markdown component's `<pre>` element SHALL use CSS classes (not inline styles) for `border`, `border-radius`, `background-color`, and `color` so that scoped CSS overrides within ToolCard context are effective.

#### Scenario: JSON code block renders as single element
- **WHEN** a formatted tool result contains a markdown code fence (e.g., ```` ```json ... ``` ````)
- **THEN** ToolCard SHALL pass the entire result string to a single `<Markdown>` component
- **AND** SHALL NOT split the string on newlines into separate `<Markdown>` components
- **AND** the rendered output SHALL appear as one contiguous code block, not multiple fragmented blocks

#### Scenario: Plain text result rendered correctly
- **WHEN** a formatted tool result is plain text (no markdown constructs)
- **THEN** ToolCard SHALL still render it as a single `<Markdown>` block
- **AND** line breaks within the plain text SHALL be preserved by the Markdown renderer

#### Scenario: Compact spacing between header and content
- **WHEN** a ToolCard is expanded and renders result content
- **THEN** the `.tool-card-body-inner` container SHALL have `padding: 2px 14px 6px` and `margin-top: 0`
- **AND** the container SHALL NOT have a `border-top` property
- **AND** the total vertical gap from the header bottom edge to the first content character SHALL be approximately 8px (2px container padding + 6px `<pre>` padding), with no visible color contrast gap between container and `<pre>`

#### Scenario: Scoped pre element styling
- **WHEN** a `<pre>` element renders inside `.tool-card-body-inner` or `.mcp-raw-block`
- **THEN** the `<pre>` SHALL have `padding: 6px 10px`, `margin: 0`, `border: none`, and `border-radius: 4px` via scoped CSS class override (the Markdown component SHALL NOT use inline styles for these properties)
- **AND** `<pre>` elements outside ToolCard context (e.g., in chat messages) SHALL NOT be affected — they SHALL retain `border: 1px solid`, `border-radius: 8px`, and `background: var(--color-bg)` via the base `md-pre-base` CSS class

### Requirement: MCP tool result raw block rendering
When an MCP tool result is not valid JSON, the ToolCard SHALL render the result as a `.mcp-raw-block` with monospace font, pre-wrap whitespace, and 280px max-height with internal scroll. The `.mcp-raw-block` SHALL use ultra-compact spacing: `padding: 2px 14px 6px` and SHALL NOT have a `border-top`.

#### Scenario: MCP plain text renders as raw block
- **WHEN** an MCP tool result is plain text or code (not JSON)
- **THEN** ToolCard SHALL render `<div class="mcp-raw-block">` containing the full result text
- **AND** the block SHALL have `font-family: JetBrains Mono`, `white-space: pre-wrap`, `max-height: 280px; overflow-y: auto`
- **AND** the block SHALL have `padding: 2px 14px 6px` with no `border-top`

#### Scenario: Raw block preserves line breaks
- **WHEN** an MCP tool returns multi-line output
- **THEN** the raw block SHALL preserve all newlines and whitespace
- **AND** the block SHALL scroll internally when content exceeds 280px

### Requirement: MCP tool result rich list rendering
When a tool with `mcp__` prefix returns a result that is valid JSON (starts with `{` or `[`), the ToolCard SHALL render the result as a `.mcp-rich-list` component instead of a standard code-fenced block. The rich list SHALL display structured results as vertically stacked cards with title, score, URL, content, and metadata. The `.mcp-rich-list` SHALL NOT have a `border-top` — visual separation relies on background contrast.

#### Scenario: MCP JSON array renders as rich list
- **WHEN** an MCP tool result is a JSON array
- **THEN** ToolCard SHALL render `<div class="mcp-rich-list">` with one `<div class="mcp-rich-item">` per array element
- **AND** each item SHALL attempt to extract `title`, `score`, `url`, `content` fields from the JSON object
- **AND** unrecognized fields SHALL be ignored

#### Scenario: MCP JSON object renders as rich list
- **WHEN** an MCP tool result is a JSON object containing a search results-like structure
- **THEN** ToolCard SHALL attempt to render it as a rich list using the same field extraction logic

#### Scenario: Rich list compact spacing
- **WHEN** a `.mcp-rich-list` renders inside a ToolCard
- **THEN** the list SHALL NOT have a `border-top` property
- **AND** visual separation from the header SHALL rely on background contrast
