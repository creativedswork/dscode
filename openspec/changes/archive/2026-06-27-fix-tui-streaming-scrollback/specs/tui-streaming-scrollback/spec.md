## ADDED Requirements

### Requirement: Streaming render SHALL preserve terminal scrollback

`ConversationView.renderLive()` SHALL call `tui.requestRender(false)` instead of `tui.requestRender(true)` so that the terminal scrollback buffer is never cleared by `\x1b[3J` during LLM streaming output.

#### Scenario: User scrolls up during streaming

- **WHEN** LLM is streaming output (token deltas arriving) AND the user scrolls up in the terminal (mouse wheel or Shift+PgUp)
- **THEN** the user's viewport SHALL remain at the scrolled position, and previously output content SHALL be visible in the terminal scrollback

#### Scenario: Content continues to stream while user is scrolled up

- **WHEN** the user has scrolled up during streaming AND a new token delta arrives
- **THEN** the new content SHALL be appended at the bottom of the output without disrupting the user's scroll position or clearing scrollback

#### Scenario: Finalized blocks render with force

- **WHEN** `ConversationView.render()` is called for finalized blocks
- **THEN** it SHALL continue to call `tui.requestRender(true)` to ensure deterministic full-screen rendering for committed content

#### Scenario: Streaming content changes within same line count

- **WHEN** `renderLive()` produces rendered output with the same number of lines as the previous call but changed content
- **THEN** pi-tui differential rendering SHALL detect the changed lines via `firstChanged`/`lastChanged` and rewrite only those lines

#### Scenario: Streaming content grows in line count

- **WHEN** `renderLive()` produces rendered output with more lines than the previous call
- **THEN** pi-tui differential rendering SHALL detect `appendedLines=true`, scroll content to make room, and append new lines via `appendStart` path
