## ADDED Requirements

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
- **AND** `transitionPhase` SHALL remain `"idle"`
- **AND** no `artifact generate` command SHALL be sent

### Requirement: Reduced motion bypasses transition animation
When the user's system has `prefers-reduced-motion: reduce`, the transition animation SHALL be skipped entirely.

#### Scenario: Reduced motion skips animation
- **WHEN** user selects "Dashboard" and `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is true
- **THEN** the animation SHALL be skipped
- **AND** `artifactLoading` SHALL be set to `true`
- **AND** `viewMode` SHALL be set to `"dashboard"` when artifact is ready
- **AND** `transitionPhase` SHALL remain `"idle"`

## MODIFIED Requirements

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
