# session-view-mode Specification

## Purpose

Define WebUI Chat and Dashboard view selection, rendering, input routing, transitions, and Session-bound state.
## Requirements
### Requirement: View mode dropdown in header

The App Header SHALL always render a View Mode selector containing Chat, Session Dashboard and Eval Dashboard controls. Session Dashboard SHALL only be enterable by explicit selection from a non-empty Chat view. Its control SHALL be disabled in Eval, and the App SHALL reject programmatic or stale-transition attempts to enter Session Dashboard unless Chat is still active. Selecting Eval with no state or terminal `completed`/`failed` state, including a report restored from cache, SHALL send the standard `/eval` slash command for the current Session and wait for the authoritative starting lifecycle event to enter `eval_dashboard`. It SHALL NOT fabricate local lifecycle state or use a separate client command. Selecting Eval during `starting`/`running` SHALL only reopen the in-flight progress.

#### Scenario: View mode selector renders

- **WHEN** the App renders with no Eval lifecycle or cache
- **THEN** the selector SHALL expose Chat, Dashboard and Eval
- **AND** Eval SHALL be enabled and remain non-active until selected
- **AND** SHALL use the same warm design system tokens as other Header controls

#### Scenario: Eval becomes available

- **WHEN** WebUI receives an Eval Dashboard lifecycle event or restores a valid Eval cache entry
- **THEN** the existing Eval control SHALL remain visible and enabled
- **AND** SHALL visually indicate when a completed report is available

#### Scenario: Selector activates Eval for the first time

- **WHEN** the user selects Eval while no Eval lifecycle or valid cache exists
- **THEN** WebUI SHALL send `{ "type": "slash", "command": "/eval" }`
- **AND** SHALL NOT send an artifact generation request
- **AND** the synchronous starting lifecycle event SHALL set `viewMode` to `eval_dashboard`

#### Scenario: Completed or cached Eval is selected

- **WHEN** the user selects Eval while the current state is completed, failed or restored from a completed cache entry
- **THEN** WebUI SHALL send `{ "type": "slash", "command": "/eval" }`
- **AND** the new starting event SHALL replace the terminal presentation with preparation for the current Session

#### Scenario: In-flight Eval is selected

- **WHEN** the user selects Eval while the current state is starting or running
- **THEN** WebUI SHALL set `viewMode` to `eval_dashboard`
- **AND** SHALL NOT start a concurrent duplicate Eval run

#### Scenario: Switch to Session Dashboard mode

- **WHEN** the user selects Dashboard from a non-empty Chat view
- **THEN** if a valid Session Dashboard cache entry exists, it SHALL render instantly
- **AND** otherwise the existing reduced-motion or Chat → Dashboard transition flow SHALL generate it

#### Scenario: Eval cannot enter Session Dashboard directly

- **WHEN** Eval is the active view
- **THEN** the Session Dashboard control SHALL be disabled
- **AND** a programmatic `session_dashboard` mode request SHALL leave Eval active
- **AND** the user SHALL return to Chat before entering Session Dashboard

#### Scenario: Eval interrupts a pending Session Dashboard transition

- **WHEN** Chat has started a Session Dashboard transition and Eval becomes active before the transition commits
- **THEN** the stale transition completion SHALL NOT enter Session Dashboard
- **AND** Eval SHALL remain active

#### Scenario: Switch to active Eval Dashboard mode

- **WHEN** the user selects Eval and an in-flight Eval state exists
- **THEN** `viewMode` SHALL become `eval_dashboard`
- **AND** the active lifecycle SHALL render without another Eval command

#### Scenario: Switch back to Chat mode

- **WHEN** the user selects Chat from either Dashboard mode
- **THEN** the main content area SHALL render ChatView

#### Scenario: Default mode on load

- **WHEN** the app initializes without a running Eval event
- **THEN** `viewMode` SHALL default to `chat`

### Requirement: View mode state lives in App

The `viewMode` state SHALL be managed by `App.tsx` using the shared union `"chat" | "session_dashboard" | "eval_dashboard"`. Session Dashboard and Eval Dashboard SHALL maintain separate HTML, loading, metadata and cache state.

#### Scenario: State controls main area

- **WHEN** `viewMode` is `chat`
- **THEN** the main content area SHALL render ChatView
- **WHEN** `viewMode` is `session_dashboard`
- **THEN** it SHALL render the mutable Session Dashboard artifact
- **WHEN** `viewMode` is `eval_dashboard`
- **THEN** it SHALL render the read-only Eval presentation

#### Scenario: Artifact state remains isolated

- **WHEN** a completed Eval event arrives while Session Dashboard HTML is cached in memory
- **THEN** Eval HTML SHALL update only Eval artifact state
- **AND** Session Dashboard HTML/loading state SHALL remain unchanged

### Requirement: Responsive dropdown behavior

On viewports narrower than 768 pixels, the View Mode selector SHALL keep Chat, Dashboard and Eval controls visible while reducing non-essential labels or spacing.

#### Scenario: Narrow viewport selector

- **WHEN** the viewport width is less than 768 pixels
- **THEN** the selector SHALL preserve an accessible control for each available mode
- **AND** mode text MAY collapse to icons with accessible names
- **AND** the selector SHALL not cause horizontal page overflow

### Requirement: Dashboard mode pure-instruction input

When `viewMode` is `session_dashboard`, MessageInput SHALL retain pure-instruction mode and send artifact update commands without entering conversation history. When `viewMode` is `eval_dashboard`, MessageInput SHALL not render and no artifact update command SHALL be available.

#### Scenario: Session Dashboard instruction sent as artifact update

- **WHEN** `viewMode` is `session_dashboard` and the user submits text in MessageInput
- **THEN** the frontend SHALL send `{ "type": "artifact", "action": "update", "instruction": "<user text>" }`
- **AND** SHALL NOT send the text as a chat message

#### Scenario: Session Dashboard placeholder

- **WHEN** `viewMode` is `session_dashboard`
- **THEN** MessageInput SHALL display the Dashboard modification placeholder
- **AND** slash-command autocomplete SHALL remain hidden

#### Scenario: Eval Dashboard has no modification input

- **WHEN** `viewMode` is `eval_dashboard`
- **THEN** MessageInput SHALL not render
- **AND** the frontend SHALL not send `artifact update` for the Eval report
- **AND** a read-only indicator SHALL be visible

### Requirement: Session switch resets view mode to chat

When the current Session changes while `viewMode` is `session_dashboard`, the frontend SHALL reset to Chat because that artifact is bound to the current Session. When the current Session changes while `viewMode` is `eval_dashboard`, the Eval view SHALL preserve its independent target/run identity until the user changes modes.

#### Scenario: Session Dashboard resets on Session switch

- **WHEN** `currentSessionId` changes to a new value
- **AND** `viewMode` is `session_dashboard`
- **THEN** `viewMode` SHALL become `chat`
- **AND** ChatView SHALL render the new Session messages

#### Scenario: Eval Dashboard persists on Session switch

- **WHEN** `currentSessionId` changes while `viewMode` is `eval_dashboard`
- **THEN** the Eval view SHALL remain open
- **AND** SHALL continue to display its original `targetSessionId` and `runId`
- **AND** SHALL NOT relabel the report as belonging to the newly selected Session

#### Scenario: Session switch from Chat stays in Chat

- **WHEN** `currentSessionId` changes while `viewMode` is `chat`
- **THEN** `viewMode` SHALL remain `chat`

#### Scenario: First Session assignment is not a switch

- **WHEN** `currentSessionId` transitions from null to its initial value
- **THEN** WebUI SHALL not perform a spurious mode reset

### Requirement: Transition phase state machine

The App SHALL manage the existing `"idle" | "animating"` transition phase only for Chat → Session Dashboard generation. Eval Dashboard lifecycle events SHALL switch directly to the Eval starting/running/completed/failed view and SHALL not trigger the conversation destruction animation.

#### Scenario: Session Dashboard transition starts

- **WHEN** the user selects Dashboard from Chat with no cache hit and reduced motion is not preferred
- **THEN** `transitionPhase` SHALL become `animating`
- **AND** Session Dashboard artifact generation SHALL start immediately

#### Scenario: Session Dashboard transition completes

- **WHEN** TransitionCanvas completes and the Session Dashboard artifact is ready
- **THEN** `transitionPhase` SHALL return to `idle`
- **AND** `viewMode` SHALL become `session_dashboard`

#### Scenario: Eval lifecycle bypasses transition

- **WHEN** an Eval starting, running, completed or failed lifecycle event causes WebUI to open Eval
- **THEN** `transitionPhase` SHALL remain `idle`
- **AND** `viewMode` SHALL become `eval_dashboard` without rendering TransitionCanvas

### Requirement: Cache hit bypasses transition animation

A valid Session Dashboard cache hit or Eval Dashboard cache selection SHALL switch to the corresponding view without transition animation or model generation.

#### Scenario: Session Dashboard cache hit

- **WHEN** the user selects Dashboard from Chat and a valid current-Session Dashboard cache entry exists
- **THEN** Session Dashboard HTML SHALL load from cache
- **AND** `viewMode` SHALL become `session_dashboard`
- **AND** no artifact generation or transition SHALL run

#### Scenario: Eval Dashboard cache hit

- **WHEN** the user selects an available cached Eval report
- **THEN** Eval HTML and identity SHALL load from the Eval cache
- **AND** `viewMode` SHALL become `eval_dashboard`
- **AND** no artifact generation or transition SHALL run
