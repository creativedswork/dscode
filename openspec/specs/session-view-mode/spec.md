## ADDED Requirements

### Requirement: View mode dropdown in header
The App Header SHALL render a View Mode dropdown selector in the right zone, positioned to the left of the ThemeToggle button, allowing the user to switch the main content area between "Chat" and "Dashboard" modes.

#### Scenario: View mode dropdown renders
- **WHEN** the App renders
- **THEN** a dropdown with options "Chat" and "Dashboard" is visible in the Header right zone, to the left of the ThemeToggle
- **AND** the dropdown uses the same warm design system tokens as other Header controls

#### Scenario: Switch to Dashboard mode
- **WHEN** the user selects "Dashboard" from the View Mode dropdown
- **THEN** if a valid dashboard cache entry exists, the cached HTML is rendered instantly and `viewMode` is set to `"dashboard"` with no animation
- **AND** if `prefers-reduced-motion` is active, the frontend sets `artifactLoading` to `true`, sends an `artifact generate` command, and sets `viewMode` to `"dashboard"` when the artifact is ready with no animation
- **AND** otherwise, the frontend sets `transitionPhase` to `"animating"`, sends an `artifact generate` command in parallel, and defers `viewMode` change until the animation completes AND the artifact is ready

#### Scenario: Switch back to Chat mode
- **WHEN** the user selects "Chat" from the View Mode dropdown while in Dashboard mode
- **THEN** the main content area renders `ChatView` instead of `ArtifactContainer`

#### Scenario: View mode dropdown disabled during transition
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** the View Mode dropdown SHALL be disabled (no interaction accepted)

#### Scenario: Default mode on load
- **WHEN** the app initializes
- **THEN** viewMode defaults to "chat"

### Requirement: View mode state lives in App
The `viewMode` state SHALL be managed by `App.tsx` as a `useState<"chat" | "dashboard">` and passed down to both Header (for the dropdown) and the main content area (for conditional rendering).

#### Scenario: State passed to header
- **WHEN** App renders the Header
- **THEN** the `viewMode` value and a `setViewMode` callback are passed as props

#### Scenario: State controls main area
- **WHEN** `viewMode` is "dashboard"
- **THEN** the main content area renders `ArtifactContainer`
- **AND** when `viewMode` is "chat", `ChatView` is rendered with its existing props

### Requirement: Responsive dropdown behavior
On viewports narrower than 768px, the View Mode dropdown SHALL display only an icon (without the mode name text label) to conserve Header space.

#### Scenario: Narrow viewport dropdown
- **WHEN** the viewport width is less than 768px
- **THEN** the View Mode dropdown displays only the current mode's icon (ChartBar for Dashboard, Chat for Chat)
- **AND** the mode name text label is hidden

### Requirement: Dashboard mode pure-instruction input
When `viewMode` is `"dashboard"`, the MessageInput SHALL operate in pure-instruction mode: user input is NOT sent as a chat message and does NOT enter the conversation history. Instead, it SHALL be sent as an `artifact update` command.

#### Scenario: Instruction sent as artifact update
- **WHEN** `viewMode` is `"dashboard"` and the user submits text in MessageInput
- **THEN** the frontend sends `{ "type": "artifact", "action": "update", "instruction": "<user text>" }` instead of `{ "type": "chat", "text": "<user text>" }`

#### Scenario: Placeholder text changes in dashboard mode
- **WHEN** `viewMode` is `"dashboard"`
- **THEN** the MessageInput placeholder displays "Describe how to modify the dashboard..." instead of the default chat placeholder

#### Scenario: Slash commands hidden in dashboard mode
- **WHEN** `viewMode` is `"dashboard"`
- **THEN** the slash command panel and autocomplete are not shown

### Requirement: Session switch resets view mode to chat
When the current session changes to a different session ID while `viewMode` is `"dashboard"`, the frontend SHALL reset `viewMode` to `"chat"`.

#### Scenario: Dashboard mode reset on session switch
- **WHEN** `currentSessionId` changes to a new value
- **AND** `viewMode` is `"dashboard"`
- **THEN** `viewMode` is set to `"chat"`
- **AND** the main content area renders `ChatView` with the new session's messages

#### Scenario: Session switch from chat stays in chat
- **WHEN** `currentSessionId` changes to a new value
- **AND** `viewMode` is `"chat"`
- **THEN** `viewMode` remains `"chat"`

#### Scenario: First session assignment does not trigger mode switch
- **WHEN** the app first receives a sessions event and `currentSessionId` transitions from `null` to a value
- **AND** `viewMode` is `"dashboard"` (unlikely, but defensive)
- **THEN** `viewMode` SHALL NOT be reset to `"chat"` (no spurious switch on first load)

### Requirement: Transition phase state machine
The App SHALL manage a `transitionPhase` state (`"idle"` | `"animating"`) to coordinate the Chat → Dashboard transition animation. The view mode switch SHALL be deferred until the animation completes AND the dashboard artifact is ready.

#### Scenario: Transition phase set to animating on dashboard switch
- **WHEN** user selects "Dashboard" from the View Mode dropdown and no cache hit occurs and reduced motion is not preferred
- **THEN** `transitionPhase` SHALL be set to `"animating"`
- **AND** an `artifact generate` command SHALL be sent immediately
- **AND** `artifactLoading` SHALL be set to `true`

#### Scenario: Transition phase returns to idle on completion
- **WHEN** TransitionCanvas calls `onComplete()` (animation finished + artifact ready)
- **THEN** `transitionPhase` SHALL be set to `"idle"`
- **AND** `viewMode` SHALL be set to `"dashboard"`

#### Scenario: TransitionCanvas rendered during animation
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** TransitionCanvas SHALL be rendered as a transparent overlay above ChatView
- **AND** ChatView SHALL remain mounted and visible

#### Scenario: TransitionCanvas unmounted when idle
- **WHEN** `transitionPhase` is `"idle"`
- **THEN** TransitionCanvas SHALL NOT be rendered

### Requirement: Cache hit bypasses transition animation
When switching to Dashboard mode triggers a dashboard cache hit, the transition animation SHALL be skipped and the view mode SHALL switch instantly.

#### Scenario: Cache hit skips animation
- **WHEN** user selects "Dashboard" and a valid cache entry exists for the current session
- **THEN** `artifactHtml` SHALL be set from cache
- **AND** `viewMode` SHALL be set to `"dashboard"` immediately
