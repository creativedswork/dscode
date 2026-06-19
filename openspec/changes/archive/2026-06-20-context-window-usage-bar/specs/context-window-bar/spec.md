## ADDED Requirements

### Requirement: Context window usage bar in header
The WebUI SHALL render a segmented horizontal bar in the header center area that visualizes context window token usage, broken down by content category.

#### Scenario: Bar renders when data is available
- **WHEN** the frontend receives a `context_window` event from the server
- **THEN** the ContextWindowBar component SHALL render a horizontal bar in the header center showing colored segments for each category proportional to their token count
- **AND** the free space SHALL appear as a transparent/background-colored segment filling the remaining bar width

#### Scenario: Bar is hidden when no data
- **WHEN** no `context_window` event has been received yet (initial load)
- **THEN** the ContextWindowBar component SHALL return null and render nothing

#### Scenario: Bar hidden on narrow viewports
- **WHEN** the viewport width is less than 768px
- **THEN** the ContextWindowBar SHALL be hidden (display: none or conditional render)

### Requirement: Category color coding
The ContextWindowBar SHALL use distinct colors for each content category, defined as CSS custom properties for light/dark theme support.

#### Scenario: Colors defined as CSS custom properties
- **WHEN** the stylesheet is loaded
- **THEN** `:root` SHALL define `--cw-system`, `--cw-user`, `--cw-thinking`, `--cw-file-read`, `--cw-file-edit`, `--cw-terminal`, `--cw-browser`, `--cw-other` custom properties
- **AND** `.dark` SHALL define corresponding dark variants of each property

#### Scenario: Each category uses its designated color
- **WHEN** the ContextWindowBar renders a segment for category "user"
- **THEN** the segment's background-color SHALL be `var(--cw-user)`

### Requirement: Numerical token summary
The ContextWindowBar SHALL display a compact numerical summary of token usage adjacent to or overlaid on the bar.

#### Scenario: Summary shows used/total
- **WHEN** the ContextWindowBar renders with data `{ used: 8200, total: 128000 }`
- **THEN** the component SHALL display "8.2k / 128k" (or equivalent human-readable format) as a text label

#### Scenario: Summary updates on new data
- **WHEN** a new `context_window` event arrives with updated token counts
- **THEN** the displayed summary SHALL update to reflect the new values

### Requirement: Hover tooltip with detailed breakdown
The ContextWindowBar SHALL show a tooltip on hover revealing the per-category token counts with human-readable category names.

#### Scenario: Tooltip appears on hover
- **WHEN** the user hovers over the ContextWindowBar
- **THEN** a tooltip SHALL appear listing each category with its name, token count, and color indicator

#### Scenario: Tooltip hidden on mouse leave
- **WHEN** the user moves the mouse away from the ContextWindowBar
- **THEN** the tooltip SHALL disappear

### Requirement: Bar updates in real-time
The ContextWindowBar SHALL update its display each time a new `context_window` event is received from the WebSocket connection.

#### Scenario: Bar updates after tool call
- **WHEN** a tool call completes and the server sends an updated `context_window` event
- **THEN** the bar's segments and numerical summary SHALL re-render to reflect the new token counts

#### Scenario: Bar updates after turn completes
- **WHEN** the assistant turn ends and the server sends an updated `context_window` event
- **THEN** the bar's segments and summary SHALL re-render

### Requirement: Segments rendered with minimum visible width
The ContextWindowBar SHALL ensure segments that represent a non-zero but very small percentage of the context window are still visible.

#### Scenario: Small segment gets minimum width
- **WHEN** a category has 0.1% of total tokens (nearly invisible at full scale)
- **THEN** that segment SHALL render with a minimum width of 2px so it remains perceptible
