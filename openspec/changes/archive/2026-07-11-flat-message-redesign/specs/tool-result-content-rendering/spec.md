## ADDED Requirements

### Requirement: MCP tool result rich list rendering
When a tool with `mcp__` prefix returns a result that is valid JSON (starts with `{` or `[`), the ToolCard SHALL render the result as a `.mcp-rich-list` component instead of a standard code-fenced block. The rich list SHALL display structured results as vertically stacked cards with title, score, URL, content, and metadata.

#### Scenario: MCP JSON array renders as rich list
- **WHEN** an MCP tool result is a JSON array
- **THEN** ToolCard SHALL render `<div class="mcp-rich-list">` with one `<div class="mcp-rich-item">` per array element
- **AND** each item SHALL attempt to extract `title`, `score`, `url`, `content` fields from the JSON object
- **AND** unrecognized fields SHALL be ignored

#### Scenario: MCP JSON object renders as rich list
- **WHEN** an MCP tool result is a JSON object containing a search results-like structure
- **THEN** ToolCard SHALL attempt to render it as a rich list using the same field extraction logic

### Requirement: MCP tool result raw block rendering
When an MCP tool result is not valid JSON, the ToolCard SHALL render the result as a `.mcp-raw-block` with monospace font, pre-wrap whitespace, and 280px max-height with internal scroll.

#### Scenario: MCP plain text renders as raw block
- **WHEN** an MCP tool result is plain text or code (not JSON)
- **THEN** ToolCard SHALL render `<div class="mcp-raw-block">` containing the full result text
- **AND** the block SHALL have `font-family: JetBrains Mono`, `white-space: pre-wrap`, `max-height: 280px; overflow-y: auto`

#### Scenario: Raw block preserves line breaks
- **WHEN** an MCP tool returns multi-line output
- **THEN** the raw block SHALL preserve all newlines and whitespace
- **AND** the block SHALL scroll internally when content exceeds 280px

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
