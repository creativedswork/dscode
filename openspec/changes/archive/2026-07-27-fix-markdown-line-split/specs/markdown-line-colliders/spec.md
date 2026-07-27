## ADDED Requirements

### Requirement: Single-pass Markdown rendering with line colliders

The Markdown component SHALL render the entire content string as a single Markdown parse, then post-process the rendered DOM to inject `data-collider` spans for TransitionCanvas animation targets. Content SHALL NOT be split by newlines into multiple Markdown instances.

#### Scenario: Fenced code blocks render correctly

- **WHEN** Markdown content contains a fenced code block spanning multiple lines
- **THEN** the code block SHALL render as a single `<pre><code>` block with syntax highlighting
- **AND** each line within the code block SHALL be wrapped in `<span data-collider="code-line">`

#### Scenario: Multi-item lists render correctly

- **WHEN** Markdown content contains an ordered or unordered list with multiple items
- **THEN** the list SHALL render as a single `<ul>` or `<ol>` element with all items
- **AND** each list item text SHALL be wrapped in `<span data-collider="text-line">`

#### Scenario: Tables render correctly

- **WHEN** Markdown content contains a table with header row and data rows
- **THEN** the table SHALL render as a complete `<table>` element
- **AND** each cell text SHALL be wrapped in `<span data-collider="text-line">`

#### Scenario: Blockquote paragraphs render correctly

- **WHEN** Markdown content contains a multi-paragraph or multi-line blockquote
- **THEN** the blockquote SHALL render as a complete `<blockquote>` element
- **AND** text lines within the blockquote SHALL be wrapped in `<span data-collider="text-line">`

### Requirement: Collider injection only for completed messages

The Markdown component SHALL only inject `data-collider` spans when the message is not actively streaming. During streaming, collider injection SHALL be skipped.

#### Scenario: Streaming message skips collider injection

- **WHEN** the `isStreaming` prop is true
- **THEN** the Markdown component SHALL render content without injecting `data-collider` spans into the DOM

#### Scenario: Completed message injects colliders

- **WHEN** the `isStreaming` prop is false or undefined
- **THEN** the Markdown component SHALL inject `data-collider="text-line"` and `data-collider="code-line"` spans into the rendered DOM after React commits

### Requirement: DOM post-processing does not affect layout

The injected `<span data-collider="text-line">` and `<span data-collider="code-line">` elements SHALL NOT alter the visual layout, spacing, or styling of the rendered content.

#### Scenario: No layout shift from collider spans

- **WHEN** `data-collider` spans are injected into the DOM
- **THEN** the visual appearance, line height, spacing, and text flow SHALL be identical to the pre-injection state
