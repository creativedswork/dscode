## ADDED Requirements

### Requirement: IME composition enter key suppression
The input area SHALL NOT submit a message when the Enter key is pressed during IME (Input Method Editor) composition. The system SHALL track IME composition state via `compositionstart` and `compositionend` events and suppress the Enter submission when a composition is active.

#### Scenario: Enter confirms IME composition without submitting
- **WHEN** the user is composing text via an IME (e.g., Chinese pinyin, Japanese, Korean) and presses Enter to confirm the composed text
- **THEN** the composed text is committed to the textarea but no message is sent

#### Scenario: Enter submits when not composing
- **WHEN** the user presses Enter in the textarea while no IME composition is active and Shift is not held
- **THEN** the message is submitted normally
