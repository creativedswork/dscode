# Delta Spec: web-frontend

Change: `web-thinking-timer`

## MODIFIED Requirements

### Requirement: Processing timer driven by turn start anchor
The frontend SHALL compute elapsed processing time from the `turnStartRef` anchor, set by `handleSend` and the `loader { state: "show" }` event, not from the `processing` state flag. The timer SHALL update every animation frame while the anchor is non-zero and reset to 0 when the turn ends. The thinking segment timer is an exception: it SHALL be driven by a per-thinking anchor (`thinkingStartedAt`) recorded at the first `thinking_delta` of each thinking segment, not by `turnStartRef`, so that the displayed elapsed time reflects the current thinking segment rather than the whole turn.

#### Scenario: Timer starts on user submit
- **WHEN** the user sends a message (via Send button or Enter key)
- **THEN** `turnStartRef.current` is set to `Date.now()` in `handleSend` and the elapsed timer begins incrementing from 0s

#### Scenario: Timer increments during thinking
- **WHEN** the model sends `thinking_delta` events for a thinking segment
- **THEN** the `ThinkingBlock` label displays `Thinking · Xs` where X is the elapsed time since that segment's first `thinking_delta`, incrementing approximately every second

#### Scenario: Timer increments during waiting
- **WHEN** `processing` is true but no streaming message has arrived yet (hasStreaming is false)
- **THEN** the `WaitingBubble` displays the elapsed time from `turnStartRef`, incrementing approximately every second

#### Scenario: Timer stops on agent end
- **WHEN** the server sends `loader` event with `state: "hide"` (from `agent_end`)
- **THEN** `turnStartRef.current` is set to 0 and the elapsed timer stops

#### Scenario: Timer starts on vision/OCR pre-processing
- **WHEN** the server sends `loader` event with `state: "show"` and `turnStartRef.current` is 0
- **THEN** `turnStartRef.current` is set to `Date.now()` and the elapsed timer begins incrementing

#### Scenario: Timer resets on error
- **WHEN** the server sends an `error` event
- **THEN** `turnStartRef.current` is set to 0 and the elapsed timer is reset

## ADDED Requirements

### Requirement: Thinking block live elapsed indicator
While a thinking segment is streaming, the `ThinkingBlock` label SHALL display the segment's elapsed time (`Thinking · Xs`) driven by a per-thinking anchor recorded in the conversation reducer. The reducer SHALL record `thinkingStartedAt` on the first `thinking_delta` of a segment and `thinkingUpdatedAt` on every `thinking_delta`; both fields are optional, non-persisted, and absent from the wire protocol. The elapsed display SHALL use the shared `formatTime()` convention (`12s`, `2m 5s`) with `tabular-nums` to prevent layout shift, and SHALL tick via a component-local 1s interval rather than the backend `session_time` broadcast. The label dot SHALL pulse (opacity/scale keyframes) while streaming; the pulse animation SHALL be disabled under `prefers-reduced-motion`. When a `text_delta` or `tool_start` arrives for the message, the reducer SHALL clear `thinkingStartedAt` so a subsequent thinking segment restarts its own elapsed time.

#### Scenario: Elapsed starts on first thinking delta
- **WHEN** the reducer processes a `thinking_delta` for a message with no active `thinkingStartedAt`
- **THEN** it records `thinkingStartedAt` and `thinkingUpdatedAt` as the current time, and the label begins displaying `Thinking · 0s`

#### Scenario: Elapsed ticks while streaming
- **WHEN** the thinking segment is streaming
- **THEN** the label elapsed time increments approximately every second using `formatTime()` formatting and `tabular-nums`

#### Scenario: Dot pulses while streaming
- **WHEN** the thinking segment is streaming and `prefers-reduced-motion` is not set
- **THEN** the label dot animates a pulse; under `prefers-reduced-motion` the dot remains static

#### Scenario: New segment restarts elapsed
- **WHEN** a `text_delta` or `tool_start` arrives after a thinking segment, and a later `thinking_delta` begins a new segment
- **THEN** the reducer records a fresh `thinkingStartedAt` and the label elapsed restarts from 0s for the new segment

#### Scenario: Historical messages without anchor
- **WHEN** a message is reconstructed from history (e.g. `ready` event) without `thinkingStartedAt`
- **THEN** the label renders without a live ticking timer (static or frozen display only)

### Requirement: Thinking block frozen summary on completion
When a thinking segment ends (the message receives its first `text_delta` or `tool_start` after thinking, or the turn ends), the `ThinkingBlock` label SHALL switch from the live timer to a frozen summary `Thought for Xs` showing the segment's final elapsed time. The frozen summary SHALL remain visible in the collapsed state, the dot SHALL render static, and the elapsed value SHALL NOT continue incrementing.

#### Scenario: Freeze on first text delta
- **WHEN** a message with a streaming thinking segment receives its first `text_delta`
- **THEN** the label switches to `Thought for Xs` with the final segment elapsed time and stops incrementing

#### Scenario: Freeze on tool start
- **WHEN** a message with a streaming thinking segment receives a `tool_start` before any text
- **THEN** the label switches to `Thought for Xs` with the final segment elapsed time

#### Scenario: Frozen summary visible when collapsed
- **WHEN** the thinking block auto-collapses after streaming ends
- **THEN** the collapsed label still reads `Thought for Xs` and can be expanded by clicking

### Requirement: Thinking stall detection
While a thinking segment is streaming, the frontend SHALL compare the current time against the segment's `thinkingUpdatedAt` on each timer tick. When no `thinking_delta` has arrived for more than 15 seconds, the thinking block SHALL enter a stalled state: the left border and label dot change to the warning color, and the label appends `no output for Xs` (time since last delta) in the warning color. When a new `thinking_delta` arrives, the stalled state SHALL clear automatically and the normal streaming display resumes. Stall detection SHALL be computed entirely on the frontend from delta timestamps, with no backend events or protocol changes.

#### Scenario: Stall warning after threshold
- **WHEN** a streaming thinking segment receives no `thinking_delta` for more than 15 seconds
- **THEN** the block shows warning-colored border and dot, and the label appends `no output for Xs`

#### Scenario: Stall clears on resume
- **WHEN** a `thinking_delta` arrives while the block is in the stalled state
- **THEN** the stalled styling and `no output for Xs` note are removed and normal streaming display resumes

#### Scenario: No stall state after completion
- **WHEN** the thinking segment has ended (frozen summary displayed)
- **THEN** stall detection no longer applies and the frozen label remains unchanged

### Requirement: Phase labels annotated for TransitionCanvas cascade
Each `.phase-label` element within `AssistantMessage` SHALL carry a `data-collider="phase-label"` attribute so that `TransitionCanvas.buildRowList()` discovers and destroys them during the chat-to-dashboard cascade animation. The three phase labels — Thinking, Executing, and Response — SHALL each include this attribute on their outermost `<div>`.

#### Scenario: Phase labels destroyed during cascade
- **WHEN** the user triggers a chat-to-dashboard transition (Dashboard button click)
- **THEN** the cascade animation destroys all Thinking, Executing, and Response phase labels alongside text lines and tool cards, leaving no UI residue

#### Scenario: Phase labels absent from DOM after cascade
- **WHEN** the cascade animation completes and the dashboard view is active
- **THEN** no `.phase-label` elements from the chat view remain visible in the DOM
