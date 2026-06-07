## ADDED Requirements

### Requirement: Empty assistant content renders nothing
When an assistant message has no text content, the message bubble's content area SHALL render nothing. The thinking block and tool cards SHALL continue to render independently based on their own data presence.

#### Scenario: Tool-only response with no thinking
- **WHEN** the assistant message has `content: ""`, `thinking: ""` or undefined, `tools: [...]`, and `isStreaming: false`
- **THEN** the content area renders nothing (no "(no content)" placeholder), the tool cards render normally below

#### Scenario: Tool-only response with thinking
- **WHEN** the assistant message has `content: ""`, `thinking: "some reasoning"`, `tools: [...]`, and `isStreaming: false`
- **THEN** the ThinkingBlock renders with the thinking content, the content area renders nothing, and the tool cards render normally

#### Scenario: Empty assistant message during streaming
- **WHEN** the assistant message has `content: ""`, `thinking: ""`, no tools yet, and `isStreaming: true`
- **THEN** a pulsing dot indicator renders to show the model is working, and no "(no content)" placeholder appears

#### Scenario: Normal assistant message with content
- **WHEN** the assistant message has non-empty `content`
- **THEN** the content area renders the Markdown content as before, unaffected by this change
