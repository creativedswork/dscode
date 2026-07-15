## ADDED Requirements

### Requirement: Message timestamp display
The frontend SHALL display the real creation time of each chat message in the meta line, formatted via the browser's locale-aware time formatting, and SHALL gracefully omit the time portion when a message has no timestamp.

#### Scenario: User message shows real timestamp
- **WHEN** a user message has `message.createdAt` set to a valid epoch millisecond value
- **THEN** the `UserBubble` meta line SHALL display `"You · HH:MM AM/PM"` (locale-dependent) using `new Date(message.createdAt).toLocaleTimeString()`
- **AND** the time string SHALL reflect the actual message creation time, not a hardcoded value

#### Scenario: Assistant message shows real timestamp
- **WHEN** an assistant message has `message.createdAt` set to a valid epoch millisecond value
- **THEN** the `AssistantMessage` meta line SHALL display `"dscode · HH:MM AM/PM"` (locale-dependent) using `new Date(message.createdAt).toLocaleTimeString()`
- **AND** the time string SHALL reflect the actual message creation time, not a hardcoded value

#### Scenario: Message without timestamp omits time
- **WHEN** a message has `message.createdAt` undefined or absent (e.g., legacy history messages)
- **THEN** the meta line SHALL display only the role label (`"You"` for user, `"dscode"` for assistant) without the time separator or time string
- **AND** no "09:41" or any hardcoded time string SHALL be displayed

#### Scenario: Timestamp updates as new messages arrive
- **WHEN** a new message is created during an active session
- **THEN** its `createdAt` SHALL reflect the wall-clock time at creation
- **AND** the displayed time SHALL differ from the time shown on previously created messages

#### Scenario: All hardcoded time strings removed
- **WHEN** the ChatView renders any message bubble (`UserBubble` or `AssistantMessage`)
- **THEN** no hardcoded time string (such as `"09:41"`) SHALL appear anywhere in the meta line
- **AND** all time values SHALL derive from `message.createdAt`
