## ADDED Requirements

### Requirement: Noise messages excluded from title candidates

The session title extraction SHALL skip user messages that match any of the following noise patterns. These messages are considered low-information and unsuitable as session titles.

Noise patterns:
- English single-word acknowledgments and greetings: `thanks`, `thank you`, `thx`, `ok`, `okay`, `yes`, `no`, `hi`, `hello`, `hey`, `good`, `great`, `nice`, `cool` (case-insensitive, whole-word at start)
- Chinese single-character or short acknowledgments: strings consisting entirely of `谢谢好的嗯哦啊哈嘿嗨` characters
- Punctuation-only messages: strings consisting entirely of `.,!?;:` characters

#### Scenario: English thank-you skipped

- **WHEN** a user message is "thanks" or "thank you"
- **THEN** the message SHALL be skipped as a title candidate

#### Scenario: Chinese acknowledgment skipped

- **WHEN** a user message is "好的" or "谢谢"
- **THEN** the message SHALL be skipped as a title candidate

#### Scenario: Punctuation-only skipped

- **WHEN** a user message is "!!!" or "..." or "?"
- **THEN** the message SHALL be skipped as a title candidate

#### Scenario: Noise with additional content is not skipped

- **WHEN** a user message is "thanks, now let's debug the auth flow"
- **THEN** the message SHALL NOT be skipped (it contains substantive content beyond the noise prefix)
- **AND** the title SHALL be derived from this message

### Requirement: Minimum length gate for title candidates

Any title candidate (after stripping command prefix, if applicable) SHALL be at least 10 characters long. Candidates shorter than 10 characters SHALL be skipped.

#### Scenario: Short candidate skipped

- **WHEN** a user message after stripping is "fix it" (6 characters)
- **THEN** the message SHALL be skipped as a title candidate

#### Scenario: Borderline candidate accepted

- **WHEN** a user message after stripping is "Fix the login" (13 characters)
- **THEN** the message SHALL be accepted as a title candidate

#### Scenario: Command with short argument skipped

- **WHEN** a message is `/opsx:apply fix` and after stripping the command prefix the argument is "fix" (3 characters)
- **THEN** the message SHALL be skipped as a title candidate
