## Purpose

Defines how tool results are formatted for display in the frontend, ensuring content-aware rendering with proper code fences, MCP rich lists, and visual distinction.
## Requirements
### Requirement: Content-aware tool result formatting
`formatToolResultForUI` SHALL detect the content type of tool result text and apply appropriate formatting before it reaches the frontend. The function SHALL produce markdown-ready output so that ToolCard can render it through the shared `<Markdown>` component. The default truncation limit SHALL be 2000 characters.

#### Scenario: JSON detected and pretty-printed
- **WHEN** a tool result string starts with `{` or `[` and `JSON.parse` succeeds
- **THEN** the function SHALL `JSON.stringify` the parsed value with 2-space indentation
- **AND** SHALL wrap the result in a markdown code fence with `json` language tag (```` ```json ````)

#### Scenario: bash tool result wrapped in code fence
- **WHEN** a `bash` tool completes with output text
- **THEN** the function SHALL wrap the result in a markdown code fence with `sh` language tag (```` ```sh ````)
- **AND** SHALL preserve the existing truncation behavior (2000 char default)

#### Scenario: grep tool result with JSON output
- **WHEN** a `grep` tool completes and the result is valid JSON
- **THEN** the function SHALL pretty-print and wrap as ```` ```json ````
- **AND** SHALL preserve the existing truncation behavior

#### Scenario: grep tool result with plain text output
- **WHEN** a `grep` tool completes and the result is not valid JSON
- **THEN** the function SHALL wrap the result in a markdown code fence without language tag (```` ``` ````)
- **AND** SHALL preserve the existing truncation behavior

#### Scenario: glob tool result formatted
- **WHEN** a `glob` tool completes
- **THEN** the function SHALL apply the same JSON detection and code fence wrapping as `grep`

#### Scenario: read_file tool result wrapped in code fence
- **WHEN** a `read_file` tool completes with file content
- **THEN** the function SHALL wrap the result in a markdown code fence without language tag (```` ``` ````)
- **AND** SHALL preserve the existing truncation behavior

#### Scenario: write_file / overwrite_file summary preserved
- **WHEN** a `write_file` or `overwrite_file` tool completes
- **THEN** the function SHALL continue to use the existing `extractWriteSummary` behavior
- **AND** SHALL NOT apply additional code fence wrapping

#### Scenario: Unknown tool with JSON result
- **WHEN** an unrecognized tool produces a result that is valid JSON
- **THEN** the function SHALL pretty-print and wrap as ```` ```json ````
- **AND** SHALL preserve the 2000-char truncation behavior

#### Scenario: Unknown tool with non-JSON result
- **WHEN** an unrecognized tool produces a result that is not JSON
- **THEN** the function SHALL preserve the 2000-char truncation behavior without code fence wrapping

### Requirement: ToolCard single Markdown block rendering
The ToolCard component SHALL render the entire formatted tool result as a single `<Markdown>` block rather than splitting by newlines into individual per-line `<Markdown>` components. This ensures that multi-line markdown constructs (code fences, tables, lists) are correctly parsed as complete structures. The container element (`.tool-card-body-inner`) SHALL NOT set `font-family`, `color`, `white-space`, `font-size`, or `line-height` properties — these SHALL be owned entirely by the `<Markdown>` component's element overrides.

#### Scenario: JSON code block renders as single element
- **WHEN** a formatted tool result contains a markdown code fence (e.g., ```` ```json ... ``` ````)
- **THEN** ToolCard SHALL pass the entire result string to a single `<Markdown>` component
- **AND** SHALL NOT split the string on newlines into separate `<Markdown>` components
- **AND** the rendered output SHALL appear as one contiguous bordered code block, not multiple fragmented blocks

#### Scenario: Plain text result rendered correctly
- **WHEN** a formatted tool result is plain text (no markdown constructs)
- **THEN** ToolCard SHALL still render it as a single `<Markdown>` block
- **AND** line breaks within the plain text SHALL be preserved by the Markdown renderer

#### Scenario: Code block preserves horizontal scrolling
- **WHEN** a code block inside the tool result contains lines longer than the card width
- **THEN** the `<pre>` element SHALL scroll horizontally (`overflow-x: auto`)
- **AND** the container SHALL NOT set `white-space: pre-wrap` that would be inherited by `<pre>` and cause text wrapping

#### Scenario: No blank space from code block margins
- **WHEN** a tool result renders a `<pre>` element inside the tool card
- **THEN** the `<pre>` element SHALL have a vertical margin no greater than 4px top and 4px bottom
- **AND** the container padding SHALL not exceed 10px top and 12px bottom

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

### Requirement: MCP tool result raw block rendering
When an MCP tool result is not valid JSON, the ToolCard SHALL render the result through the `<Markdown>` component so that headings, lists, code blocks, and inline code are properly formatted. The container element (`.mcp-raw-block`) SHALL NOT set `font-family`, `color`, `white-space`, or `word-break` properties — these SHALL be owned by the `<Markdown>` component.

#### Scenario: MCP plain text renders as Markdown
- **WHEN** an MCP tool result is plain text or code (not JSON)
- **THEN** ToolCard SHALL render `<Markdown>{tool.result}</Markdown>` inside `.mcp-raw-block`
- **AND** markdown constructs (headings, lists, code fences, inline code) SHALL be rendered as styled HTML elements

#### Scenario: MCP raw block preserves line breaks
- **WHEN** an MCP tool returns multi-line output
- **THEN** the Markdown renderer SHALL preserve all newlines and whitespace
- **AND** the block SHALL scroll internally when content exceeds 400px max-height

#### Scenario: MCP raw block no CSS conflicts
- **WHEN** the `.mcp-raw-block` container renders `<Markdown>` content
- **THEN** the container SHALL NOT set `font-family`, `color`, `white-space`, or `word-break`
- **AND** the `<Markdown>` component's `pre`, `code`, and `p` overrides SHALL control all text styling

### Requirement: MCP tool card visual distinction
Tool cards for MCP tools (name starts with `mcp__`) SHALL receive the `.mcp` CSS class to apply a left accent border and display an "MCP" badge in the header.

#### Scenario: MCP class applied to tool card
- **WHEN** a tool card for `mcp__github` or any `mcp__*` tool renders
- **THEN** the card `<div>` SHALL have both `.tool-card` and `.mcp` classes
- **AND** the header SHALL include a `.mcp-badge` element

#### Scenario: Non-MCP tools not affected
- **WHEN** a tool card for `read_file`, `bash`, `edit`, or any non-`mcp__` tool renders
- **THEN** the card SHALL NOT have the `.mcp` class
- **AND** the header SHALL NOT include an MCP badge

