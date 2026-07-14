## ADDED Requirements

### Requirement: MCPManager forwards progress to harness event bus
`MCPManager` SHALL subscribe to `progress` events from each `MCPClient` and emit a harness event `mcp:tool:progress` with `{ toolName, serverName, progress, total?, message? }`.

#### Scenario: Progress notification forwarded from client
- **WHEN** an MCP client emits `{ type: "progress", serverName: "my-server", params: { progressToken: 1, progress: 45, total: 100, message: "Fetching page 5" } }`
- **THEN** `MCPManager` SHALL emit a harness event `{ type: "mcp:tool:progress", toolName: "mcp__my-server_search", serverName: "my-server", progress: 45, total: 100, message: "Fetching page 5" }`

#### Scenario: Progress notification with no total
- **WHEN** an MCP client emits a progress event with `progress: 62` and no `total` field
- **THEN** the emitted harness event SHALL have `total: undefined`

#### Scenario: Progress notification with no message
- **WHEN** an MCP client emits a progress event with no `message` field
- **THEN** the emitted harness event SHALL have `message: undefined`

### Requirement: WebUiBackend broadcasts tool_progress events
`WebUiBackend` SHALL subscribe to the `mcp:tool:progress` harness event and broadcast a `tool_progress` ServerEvent to all connected WebSocket clients.

#### Scenario: tool_progress broadcast
- **WHEN** `WebUiBackend` receives harness event `{ type: "mcp:tool:progress", toolName: "mcp__search", serverName: "web", progress: 75, total: 100, message: "Page 3 of 4" }`
- **THEN** it SHALL broadcast `{ type: "tool_progress", name: "mcp__search", progress: 75, total: 100, message: "Page 3 of 4" }` to all WebSocket clients

#### Scenario: tool_progress with indeterminate total
- **WHEN** `WebUiBackend` receives a progress event with `total: undefined`
- **THEN** the broadcast event SHALL omit the `total` field

### Requirement: conversationReducer handles tool_progress
`conversationReducer` SHALL process `tool_progress` events by finding the last streaming assistant message, locating the matching `ToolCallEntry` by `name` where `result` is still empty, and updating its `progress`, `progressTotal`, and `progressMessage` fields.

#### Scenario: First progress update creates progress fields
- **WHEN** the reducer receives `{ type: "tool_progress", name: "mcp__search", progress: 30, total: 100, message: "Starting..." }`
- **AND** the last streaming message has a tool entry `{ name: "mcp__search", result: "" }`
- **THEN** the entry SHALL be updated to `{ name: "mcp__search", result: "", progress: 30, progressTotal: 100, progressMessage: "Starting..." }`

#### Scenario: Subsequent progress updates overwrite
- **WHEN** a tool entry already has `progress: 30` and the reducer receives `tool_progress` with `progress: 60, message: "Halfway"`
- **THEN** the entry SHALL be updated to `progress: 60, progressMessage: "Halfway"`

#### Scenario: Late progress after tool_end is ignored
- **WHEN** the reducer receives `tool_progress` for a tool that already has a non-empty `result` field
- **THEN** the progress SHALL NOT be applied to the entry

#### Scenario: Progress for unknown tool is ignored
- **WHEN** the reducer receives `tool_progress` with `name` that does not match any tool in the last streaming message
- **THEN** the messages array SHALL remain unchanged

### Requirement: ToolCard renders progress bar in expanded body
When a `ToolCallEntry` has a `progress` field and the card is expanded, `ToolCard` SHALL render a progress bar inside the card body, above any rich list or raw block content.

#### Scenario: Deterministic progress bar
- **WHEN** a tool has `progress: 62, progressTotal: 100`
- **THEN** the expanded body SHALL show a track (`var(--color-surface-hover)`, 4px height, 2px radius) with a fill (`var(--color-accent)`) at 62% width
- **AND** percentage text "62%" SHALL appear right-aligned in `Geist Mono 10px` color `var(--color-text-muted)`
- **AND** the fill SHALL transition smoothly with `transition: width 0.3s ease`

#### Scenario: Progress message display
- **WHEN** a tool has `progressMessage: "Fetching page 3 of 8..."`
- **THEN** the message SHALL appear below the progress bar in `Geist Sans 11px` color `var(--color-text-muted)`

#### Scenario: Indeterminate progress bar
- **WHEN** a tool has `progress: 45` but no `progressTotal`
- **THEN** the progress bar SHALL render in indeterminate mode: a 30%-width accent-colored block animating left-to-right across the track using a CSS `@keyframes` animation with 1.5s period
- **AND** percentage text SHALL NOT be shown
- **AND** if `progressMessage` is present, it SHALL be shown

#### Scenario: Progress bar fades out on completion
- **WHEN** a tool transitions from having `progress` to having a non-empty `result` (tool_end)
- **THEN** the progress bar SHALL fade out over 600ms (`opacity: 0`, `transition: opacity 600ms ease`)
- **AND** after the transition, the progress bar element SHALL be removed from the DOM (`display: none`)

### Requirement: ToolCard header shows mini progress bar when collapsed
When a `ToolCallEntry` has a `progress` field and the card is collapsed, the header SHALL display a compact mini progress bar between the args text and the collapse arrow.

#### Scenario: Mini bar in collapsed header
- **WHEN** a tool has `progress: 62, progressTotal: 100` and the card is collapsed
- **THEN** the header SHALL show a mini progress bar (2px height, ~72px width, track `var(--color-border)`, fill `var(--color-accent)` at 62% width)
- **AND** percentage text "62%" SHALL appear next to the bar in `Geist Mono 9px` color `var(--color-text-muted)`

#### Scenario: Mini bar updates with progress
- **WHEN** the collapsed card receives updated `progress: 85`
- **THEN** the mini bar fill SHALL update to 85% width with smooth transition
- **AND** the percentage text SHALL update to "85%"

#### Scenario: Mini bar shows indeterminate when no total
- **WHEN** a tool has `progress: 30` with no `progressTotal` and the card is collapsed
- **THEN** the mini bar SHALL render in indeterminate mode (animated sliding block)
- **AND** the percentage SHALL be hidden; the `progressMessage` (if any) SHALL be shown as truncated text

### Requirement: ToolCard auto-expands on first progress
When a `ToolCard` receives a `progress` field for the first time (transition from no-progress to has-progress), it SHALL automatically expand its body.

#### Scenario: Auto-expand on first progress
- **WHEN** a ToolCard initially has `progress: undefined` and then receives `progress: 10`
- **THEN** the card SHALL set `open = true` (body becomes visible with max-height transition)

#### Scenario: User collapse respected after auto-expand
- **WHEN** the ToolCard has auto-expanded due to progress and the user manually collapses it
- **THEN** subsequent progress updates SHALL NOT re-expand the card

#### Scenario: Re-expand on new tool_start
- **WHEN** a ToolCard collapses to done state, then a new `tool_start` arrives for the same tool
- **THEN** the card SHALL start in collapsed state and auto-expand again when first progress arrives

### Requirement: ToolCard header status icon reflects progress state
The ToolCard header SHALL render different status indicators based on the tool's lifecycle state.

#### Scenario: Spinner during progress
- **WHEN** a tool has a `progress` field and `result` is empty
- **THEN** the status icon SHALL render as `◌` with a CSS rotation animation (spinner)
- **AND** SHALL use `var(--color-accent)` color

#### Scenario: Checkmark on completion
- **WHEN** a tool has a non-empty `result` and `isError` is false
- **THEN** the status icon SHALL render as `✓` with `var(--color-success)` background
- **AND** the spinner animation SHALL be removed

#### Scenario: Error icon unchanged
- **WHEN** a tool has `isError: true`
- **THEN** the status icon SHALL render as `✗` with `var(--color-error)` background (existing behavior, unchanged)

### Requirement: Progress bar respects warm design system themes
All progress bar elements SHALL use CSS custom properties from the warm design system, ensuring automatic adaptation to light and dark themes.

#### Scenario: Light theme progress bar
- **WHEN** the active theme is light
- **THEN** the progress bar track SHALL use `var(--color-surface-hover)` (≈ `#f3f4f6`)
- **AND** the fill SHALL use `var(--color-accent)` (≈ `#6366f1`)
- **AND** the mini bar track SHALL use `var(--color-border)` (≈ `#e5e7eb`)

#### Scenario: Dark theme progress bar
- **WHEN** the active theme is dark
- **THEN** the progress bar track SHALL use `var(--color-surface-hover)` (≈ `#1f2937`)
- **AND** the fill SHALL use `var(--color-accent)` (≈ `#818cf8`)
- **AND** the mini bar track SHALL use `var(--color-border)` (≈ `#374151`)
