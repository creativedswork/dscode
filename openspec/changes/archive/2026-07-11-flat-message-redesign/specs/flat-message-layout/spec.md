## ADDED Requirements

### Requirement: Flat assistant message container
Assistant messages SHALL render in a flat vertical flow container (`.assistant-msg`) with no enclosing bubble. The container SHALL NOT have a `data-collider` attribute, allowing TransitionCanvas to skip it and target only leaf-level collider elements within.

#### Scenario: Assistant message renders as flat flow
- **WHEN** the frontend renders an assistant message
- **THEN** the message SHALL be a `<div class="assistant-msg">` with `display: flex; flex-direction: column; gap: 16px`
- **AND** SHALL NOT have a `data-collider` attribute
- **AND** SHALL NOT be enclosed in a bubble or card wrapper

#### Scenario: Meta row renders above content
- **WHEN** an assistant message renders
- **THEN** a meta row SHALL appear as the first child, displaying "dscode" label and timestamp
- **AND** the meta row SHALL use `font-size: 10px`, `text-transform: uppercase`, `letter-spacing: 0.06em`, `color: var(--color-text-muted)`

### Requirement: Thinking block without details element
The thinking section of assistant messages SHALL render as a `<div class="thinking">` element rather than a `<details>` element. It SHALL be always visible with a left border accent.

#### Scenario: Thinking block always visible
- **WHEN** an assistant message includes thinking content
- **THEN** the thinking text SHALL render in a `<div class="thinking">` with `border-left: 2px solid var(--border)` and `font-style: italic`
- **AND** the thinking content SHALL be immediately visible without requiring user interaction to expand

#### Scenario: Thinking block hover accent
- **WHEN** the user hovers over a thinking block
- **THEN** the `border-left-color` SHALL transition to `var(--accent)` over 0.3s

#### Scenario: Thinking label renders with dot indicator
- **WHEN** a thinking block renders
- **THEN** it SHALL display a label row containing "Thinking" in uppercase with a 5px amber dot indicator
- **AND** the label SHALL use `font-size: 10px`, `font-weight: 600`, `letter-spacing: 0.05em`

### Requirement: Tool card flat design
Tool cards SHALL render with 6px border-radius, flat background (`var(--color-surface)`), and `1px solid var(--color-border)`. The card header SHALL be clickable to toggle body visibility with a 0.3s `max-height` CSS transition.

#### Scenario: Tool card renders flat
- **WHEN** a tool call entry renders
- **THEN** the card SHALL have `border-radius: 6px`, `background: var(--color-surface)`, `border: 1px solid var(--color-border)`
- **AND** SHALL NOT have shadows or gradients

#### Scenario: Tool card header structure
- **WHEN** a tool card renders
- **THEN** the header SHALL contain: a status indicator (✓ or ✗), the tool name in mono font, truncated arguments, and a chevron arrow
- **AND** the header SHALL have `cursor: pointer` and `padding: 8px 14px`

#### Scenario: Tool card body expand/collapse
- **WHEN** the user clicks a tool card header
- **THEN** the card SHALL toggle the `.open` class
- **AND** the body SHALL transition `max-height` from `0` to a maximum over 0.3s ease
- **AND** the chevron arrow SHALL rotate 180deg

#### Scenario: Tool card hover state
- **WHEN** the user hovers over a tool card
- **THEN** the card background SHALL transition to `var(--color-surface-hover)` over 0.15s

### Requirement: MCP tool card variant
MCP tool cards (tool name starts with `mcp__`) SHALL render with a `2px solid var(--accent)` left border and an "MCP" badge next to the tool name.

#### Scenario: MCP card left border
- **WHEN** a tool card for an MCP tool renders
- **THEN** the card SHALL have class `.mcp` in addition to `.tool-card`
- **AND** the card SHALL have `border-left: 2px solid var(--accent)`

#### Scenario: MCP badge renders
- **WHEN** an MCP tool card renders
- **THEN** the header SHALL include a `.mcp-badge` span after the tool name
- **AND** the badge SHALL display "MCP" in 8px uppercase mono font with amber background

### Requirement: MCP rich list rendering
When an MCP tool returns structured multi-result data, the result body SHALL render as a `.mcp-rich-list` with vertically stacked `.mcp-rich-item` cards, each containing title, relevance score, URL, multi-paragraph content, and metadata.

#### Scenario: Rich list renders structured results
- **WHEN** an MCP tool result contains JSON array or object data
- **THEN** the result SHALL render as `<div class="mcp-rich-list">` containing `<div class="mcp-rich-item">` elements
- **AND** each item SHALL display title (`.r-title`), score badge (`.r-score`), URL (`.r-url`), content paragraphs (`.r-content`), and metadata row (`.r-meta-row`)

#### Scenario: Rich list item hover
- **WHEN** the user hovers over a rich list item
- **THEN** the item background SHALL transition to `var(--color-surface-hover)`

### Requirement: MCP raw block rendering
When an MCP tool returns unstructured or code output, the result body SHALL render as a `.mcp-raw-block` with monospace font, pre-wrap whitespace, and 280px max-height with internal scroll.

#### Scenario: Raw block renders code output
- **WHEN** an MCP tool result is not structured JSON
- **THEN** the result SHALL render as `<div class="mcp-raw-block">` with `font-family: JetBrains Mono`, `white-space: pre-wrap`, and `max-height: 280px; overflow-y: auto`

### Requirement: data-collider mapping preserved
All message elements that serve as TransitionCanvas collision targets SHALL retain their `data-collider` attributes with unchanged values: `message-card` on user bubbles, `text-line` on Markdown text lines, `code-line` on code lines, `tool-card` on tool card containers, `tool-header` on tool card headers, and `tool-result-line` on tool result content lines and MCP result items.

#### Scenario: User bubble has message-card collider
- **WHEN** a user message renders
- **THEN** the bubble `<div>` SHALL have `data-collider="message-card"`

#### Scenario: Tool card has collider attributes
- **WHEN** a tool card renders
- **THEN** the card container SHALL have `data-collider="tool-card"`
- **AND** the header SHALL have `data-collider="tool-header"`
- **AND** result content lines SHALL have `data-collider="tool-result-line"`

#### Scenario: MCP result items have result-line collider
- **WHEN** MCP rich list items or raw block lines render
- **THEN** elements within the result body SHALL have `data-collider="tool-result-line"`
