## MODIFIED Requirements

### Requirement: Input area
The frontend SHALL provide a text input area at the bottom of the screen with flat, rounded styling using the warm design system. The send button SHALL switch to a Stop button while the agent is processing (when `processing` is true, controlled exclusively by `handleSend` and the `loader` event from `agent_end`). The `assistant_end` event SHALL NOT affect the `processing` state — it only finalizes the streaming message. All text input SHALL be sent via the `chat` command channel; the server determines whether the text is a slash command or a regular chat message. The input SHALL maintain a session-scoped history buffer navigable via ArrowUp/ArrowDown.

#### Scenario: Text input and submit
- **WHEN** user types text and presses Enter (or clicks send button)
- **THEN** a `chat` command is sent via WebSocket with the input text, `processing` is set to `true` immediately, and the submitted text is recorded in the input history buffer before the textarea is cleared

#### Scenario: Input styling
- **WHEN** the input field is rendered
- **THEN** it has `border-radius: 12px`, `border: 1px solid var(--color-border)`, warm surface background, proportional font (Geist Sans), and a subtle accent border color on focus — no glow, no shadow, no pill shape

#### Scenario: Slash command autocomplete
- **WHEN** user types `/` in the input field
- **THEN** a flat dropdown appears with `border-radius: 8px`, `1px solid` border, listing available commands with warm-toned styling and amber highlight for selected item

#### Scenario: At-file autocomplete
- **WHEN** user types `@` in the input field
- **THEN** a flat dropdown appears with matching warm styling

#### Scenario: Multi-line input
- **WHEN** user presses Shift+Enter in the input field
- **THEN** a new line is inserted without submitting

#### Scenario: Input disabled during processing
- **WHEN** the agent is processing a request
- **THEN** the input field is disabled with a muted appearance, and ArrowUp/ArrowDown history navigation is suppressed

#### Scenario: Send button becomes Stop button during processing
- **WHEN** `processing` becomes true (via `handleSend`)
- **THEN** the send button is replaced by a Stop button that calls `onAbort` when clicked

#### Scenario: Stop button reverts to Send when processing ends
- **WHEN** the `loader` event with `state: "hide"` is received from the server
- **THEN** `processing` is set to `false` and the Stop button reverts to the Send button

#### Scenario: Slash command text submitted as chat
- **WHEN** user submits text starting with `/` (e.g., `/help`, `/config key value`, or `/Users/foo/bar.ts`)
- **THEN** the text is sent as a `chat` command (not `slash` command) via WebSocket, and the server routes it appropriately

#### Scenario: Input history navigation with ArrowUp
- **WHEN** the user presses ArrowUp while the textarea is focused, no popover menu is open, and the input is not processing
- **THEN** the previous submitted text is recalled into the textarea

#### Scenario: Input history navigation with ArrowDown
- **WHEN** the user presses ArrowDown while navigating history and no popover menu is open
- **THEN** the next (more recent) submitted text is recalled, or the user's current draft is restored when past the newest entry

#### Scenario: History navigation reset on typing
- **WHEN** the user recalls a history entry and then types or modifies the text
- **THEN** the history navigation position resets; the next ArrowUp recalls the most recent entry
