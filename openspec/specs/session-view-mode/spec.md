## ADDED Requirements

### Requirement: View mode dropdown in header
The App Header SHALL render a View Mode dropdown selector in the right zone, positioned to the left of the ThemeToggle button, allowing the user to switch the main content area between "Chat" and "Dashboard" modes.

#### Scenario: View mode dropdown renders
- **WHEN** the App renders
- **THEN** a dropdown with options "Chat" and "Dashboard" is visible in the Header right zone, to the left of the ThemeToggle
- **AND** the dropdown uses the same warm design system tokens as other Header controls

#### Scenario: Switch to Dashboard mode
- **WHEN** the user selects "Dashboard" from the View Mode dropdown
- **THEN** the main content area renders `ArtifactContainer` instead of `ChatView`
- **AND** the frontend sends `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }`

#### Scenario: Switch back to Chat mode
- **WHEN** the user selects "Chat" from the View Mode dropdown while in Dashboard mode
- **THEN** the main content area renders `ChatView` instead of `ArtifactContainer`

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
