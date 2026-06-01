## ADDED Requirements

### Requirement: Input history navigation
The MessageInput component SHALL maintain an in-memory history of submitted input text and allow navigation via ArrowUp/ArrowDown keys when no popover menu is open. The history SHALL be session-scoped (lost on page refresh) and capped at 100 entries.

#### Scenario: History recorded on submit
- **WHEN** the user submits non-empty text via Enter or send button
- **THEN** the text is appended to the input history buffer before the textarea is cleared

#### Scenario: Duplicate entry suppressed
- **WHEN** the user submits text identical to the most recent history entry
- **THEN** the text is NOT duplicated in the history buffer

#### Scenario: ArrowUp recalls previous entry
- **WHEN** the user presses ArrowUp while the textarea is focused, no popover menu (slash or file) is open, and the input is not processing
- **THEN** the textarea content is replaced with the previous (older) history entry, and the cursor moves to the end of the recalled text

#### Scenario: ArrowUp at oldest entry
- **WHEN** the user presses ArrowUp and the history cursor is already at the oldest entry
- **THEN** the textarea content remains unchanged (stays at the oldest entry)

#### Scenario: ArrowDown recalls next entry
- **WHEN** the user presses ArrowDown while navigating history (history cursor >= 0)
- **THEN** the textarea content is replaced with the next (more recent) history entry, and the cursor moves to the end of the recalled text

#### Scenario: ArrowDown past newest entry restores draft
- **WHEN** the user presses ArrowDown and the history cursor is at the newest entry (index 0)
- **THEN** the textarea content is restored to the user's draft text (what was in the textarea before they started navigating history), and the history cursor resets

#### Scenario: Empty history no-ops
- **WHEN** the user presses ArrowUp or ArrowDown and the history buffer is empty
- **THEN** no action is taken; the textarea content is unchanged

#### Scenario: Navigation reset on typing
- **WHEN** the user is navigating history (history cursor >= 0) and types or modifies the textarea content
- **THEN** the history cursor resets so the next ArrowUp recalls the most recent entry

#### Scenario: History navigation disabled during processing
- **WHEN** the input is disabled (processing is true)
- **THEN** ArrowUp and ArrowDown do NOT trigger history navigation

### Requirement: TUI input history recording
The TuiApp SHALL populate the pi-tui Editor's history buffer on each successful text submission by calling `this.editor.addToHistory(text)` before clearing the editor content. The pi-tui Editor SHALL handle ArrowUp/ArrowDown history navigation internally.

#### Scenario: History recorded on TUI submit
- **WHEN** the user submits non-empty text via Enter in the TUI
- **THEN** the text is passed to `this.editor.addToHistory(text)` before `this.editor.setText("")` is called

#### Scenario: TUI history navigation via Editor
- **WHEN** the user presses ArrowUp in the TUI editor after at least one submission
- **THEN** the pi-tui Editor SHALL replace the current text with the previous history entry

#### Scenario: Empty TUI submit does not record history
- **WHEN** the user presses Enter with empty text and no images in the TUI
- **THEN** `addToHistory` SHALL NOT be called
