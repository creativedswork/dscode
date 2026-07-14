## ADDED Requirements

### Requirement: ToolCard renders inline progress bar for MCP tools
The `ToolCard` component SHALL render a progress bar inside the card body when the `ToolCallEntry` has a `progress` field. The progress bar SHALL appear above rich list content (for MCP tools) or result blocks. The component SHALL support deterministic, indeterminate, and completion states.

#### Scenario: Expanded card shows progress bar above content
- **WHEN** a ToolCard for `mcp__search` has `progress: 62, progressTotal: 100` and is expanded
- **THEN** a progress bar (track + fill at 62% width) SHALL render between the header and the rich list/result area
- **AND** the fill SHALL use `var(--color-accent)` and `transition: width 0.3s ease`

#### Scenario: Progress bar shows message text
- **WHEN** a tool has `progressMessage: "Fetching page 3 of 8..."`
- **THEN** the message SHALL render below the progress bar in 11px `Geist Sans` with color `var(--color-text-muted)`

#### Scenario: Indeterminate progress bar when total is unknown
- **WHEN** a tool has `progress: 45` and no `progressTotal`
- **THEN** the progress bar SHALL render as an indeterminate animated bar with a sliding 30%-width block
- **AND** no percentage text SHALL be shown

#### Scenario: Progress bar fades out on completion
- **WHEN** a tool transitions from having `progress` to having a non-empty `result`
- **THEN** the progress bar SHALL fade `opacity` to 0 over 600ms and then be removed from DOM

### Requirement: ToolCard header shows mini progress bar when collapsed
When a `ToolCallEntry` has a `progress` field and the card is collapsed, the header SHALL display a mini progress bar between the args text and the arrow indicator.

#### Scenario: Mini bar in collapsed header with percentage
- **WHEN** a tool has `progress: 62, progressTotal: 100` and the card is collapsed
- **THEN** the header SHALL render a 2px × ~72px mini progress bar with fill at 62%
- **AND** "62%" text SHALL appear next to the bar in 9px `Geist Mono` color `var(--color-text-muted)`

#### Scenario: Mini bar indeterminate when no total
- **WHEN** a tool has `progress` without `progressTotal` and the card is collapsed
- **THEN** the mini bar SHALL render in indeterminate mode with no percentage text

### Requirement: ToolCard auto-expands on first progress
`ToolCard` SHALL automatically expand its body when the tool entry transitions from no progress to having a `progress` field. After the user manually collapses, further progress updates SHALL NOT re-expand.

#### Scenario: Auto-expand on first progress
- **WHEN** a ToolCard initially has `progress: undefined` and receives `progress: 10`
- **THEN** the card SHALL set its internal open state to `true`

#### Scenario: Manual collapse respected
- **WHEN** the user clicks the header to collapse a progress-expanded card
- **THEN** subsequent `progress` value updates SHALL NOT re-expand the card

#### Scenario: New tool_start resets collapse state
- **WHEN** a new `tool_start` event creates a fresh entry for the same tool name in a new assistant message
- **THEN** the new ToolCard SHALL start collapsed and auto-expand on first progress

### Requirement: ToolCard header status icon reflects progress
The header status icon SHALL distinguish between waiting (static `◌`), in-progress (spinning `◌`), completed (`✓`), and error (`✗`).

#### Scenario: Spinner during progress
- **WHEN** a tool has a `progress` field and empty `result`
- **THEN** the status icon SHALL be `◌` with a CSS `@keyframes` rotation animation

#### Scenario: Checkmark after completion
- **WHEN** a tool has a non-empty `result` and `isError: false`
- **THEN** the status icon SHALL be `✓`, the spinner animation SHALL stop

### Requirement: Progress bar indeterminate CSS animation
The frontend stylesheet SHALL define a `@keyframes` animation for indeterminate progress bars. A 30%-width block SHALL slide from left (0%) to right (70%) and back over 1.5 seconds using `ease-in-out` timing.

#### Scenario: Indeterminate animation in expanded bar
- **WHEN** the expanded progress bar renders in indeterminate mode
- **THEN** a `.progress-fill-indeterminate` element SHALL animate with the defined keyframe

#### Scenario: Indeterminate animation in mini bar
- **WHEN** the collapsed mini bar renders in indeterminate mode
- **THEN** the same keyframe animation SHALL apply to the mini fill element

### Requirement: MCP ToolCards render Execution Card during execution
When an MCP tool (`name` starts with `"mcp__"`) has no result yet (`result` is empty), the expanded ToolCard body SHALL render an Execution Card — a nested card with a status label, progress bar (when data available), and elapsed time. Thinking text remains in the original Thinking Block and is NOT duplicated into the ToolCard.

#### Scenario: Execution Card shown for in-progress MCP tool
- **WHEN** an MCP ToolCard is rendered with `result: ""` and `open: true`
- **THEN** the body SHALL contain an Execution Card
- **AND** the Execution Card SHALL display a label with a pulsing dot indicator and the text "Live · executing" or "Live · waiting"

#### Scenario: Execution Card waiting state when no progress
- **WHEN** an in-progress MCP tool has no `progress` field
- **THEN** the Execution Card SHALL show the status label and elapsed time
- **AND** the progress bar section SHALL NOT render

#### Scenario: Execution Card shows progress when data available
- **WHEN** an in-progress MCP tool has `progress` and `progressTotal`
- **THEN** the Execution Card SHALL render a progress bar with percentage, server message, and elapsed time

#### Scenario: Execution Card transitions to result on completion
- **WHEN** a tool receives a non-empty `result`
- **THEN** the Execution Card SHALL be replaced by the standard rich list or raw block rendering

### Requirement: MCP ToolCards auto-expand on tool start
ToolCards for MCP tools SHALL auto-expand immediately when first rendered (on `tool_start`), prior to any progress data arriving. The existing `userManuallyCollapsed` flag SHALL suppress re-expand after manual collapse.

#### Scenario: Auto-expand on MCP tool start
- **WHEN** a ToolCard for `mcp__search` first renders with `result: ""`
- **THEN** the card SHALL set its internal `open` state to `true`

#### Scenario: Manual collapse still respected for MCP tools
- **WHEN** the user clicks the header to collapse an auto-expanded MCP ToolCard
- **THEN** subsequent renders (including progress updates) SHALL NOT re-expand the card
