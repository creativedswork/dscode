## MODIFIED Requirements

### Requirement: data-collider DOM attributes

ChatView and its sub-components SHALL mark collidable elements with `data-collider` attributes to enable live DOM-based collision detection during the cascade transition animation. Text line collider spans SHALL be injected by Markdown.tsx via DOM post-processing after a single Markdown render, rather than by ChatView splitting content by newlines into separate Markdown instances.

#### Scenario: text-line marking

- **WHEN** Markdown.tsx renders a completed message's text content
- **THEN** each visible text line inside paragraph-level elements (`<p>`, `<li>`, `<blockquote>`, `<th>`, `<td>`, `<h1>`–`<h4>`) SHALL be wrapped in a `<span data-collider="text-line">` element with no additional styling or layout shift
- **AND** the wrapping SHALL be performed via DOM post-processing after the single Markdown render completes

#### Scenario: code-line marking

- **WHEN** Markdown.tsx renders a code block in a completed message
- **THEN** each line within the `<pre><code>` block SHALL have the attribute `data-collider="code-line"`
- **AND** the code block SHALL be rendered as a single contiguous Markdown block (not split by newlines before parsing)

#### Scenario: tool-card marking

- **WHEN** ToolCard.tsx renders a tool call card
- **THEN** the card container SHALL have the attribute `data-collider="tool-card"`
- **AND** the tool header SHALL have the attribute `data-collider="tool-header"`
- **AND** tool result lines SHALL have the attribute `data-collider="tool-result-line"`

#### Scenario: message-card marking

- **WHEN** ChatView renders a user or assistant message bubble
- **THEN** the bubble container SHALL have the attribute `data-collider="message-card"`

#### Scenario: ChatView renders single Markdown per message

- **WHEN** ChatView renders a user or assistant message with text content
- **THEN** the entire content string SHALL be passed to a single `<Markdown>` component instance
- **AND** the content SHALL NOT be split by newlines before being passed to Markdown
