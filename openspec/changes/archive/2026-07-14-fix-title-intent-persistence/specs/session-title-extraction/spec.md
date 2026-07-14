## ADDED Requirements

### Requirement: titleIntent persists across multiple saveSession calls

The session title extraction SHALL use `titleIntent` (set via `setTitleIntent()`) as the highest-priority persistent title source. The intent SHALL NOT be consumed (cleared) on any `extractSessionTitle()` call. It SHALL only be modified by subsequent `setTitleIntent()` calls.

#### Scenario: titleIntent survives multiple extractSessionTitle calls

- **WHEN** `setTitleIntent("MCP progress")` is called before the first `saveSession`, and `saveSession` is invoked 3+ times (from `turn_end` and `agent_end` events)
- **AND** no subsequent non-command human message exists in the messages array
- **THEN** every `extractSessionTitle()` call SHALL return "MCP progress"
- **AND** `titleIntent` SHALL remain "MCP progress" after all calls

#### Scenario: titleIntent persists even when human message appears

- **WHEN** `setTitleIntent("MCP progress")` is called, and later a user sends the non-command message "Actually the title is still broken"
- **THEN** on the next `extractSessionTitle()` call, `titleIntent` SHALL still return "MCP progress"

### Requirement: titleIntent has priority between Pass 1 and Pass 2

In `extractSessionTitle()`, the priority order SHALL be: `titleIntent` → Pass 1 (real non-command human messages) → Pass 2 (command arguments) → Pass 3 (fallback). The `titleIntent` serves as the most reliable signal — it represents the user's explicit intent when opening a session.

#### Scenario: titleIntent beats command argument

- **WHEN** `setTitleIntent("Debug title extraction")` is set, and the messages array contains only an injected system instruction and a command message `/help`
- **THEN** `extractSessionTitle()` SHALL return "Debug title extraction" (from titleIntent), not the command argument

#### Scenario: titleIntent beats Pass 1

- **WHEN** `setTitleIntent("Debug title extraction")` is set, and the messages array contains a non-command human message "Actually the bug is much deeper than that"
- **THEN** `extractSessionTitle()` SHALL return "Debug title extraction" (from titleIntent), NOT the Pass 1 human message

## MODIFIED Requirements

### Requirement: Update session title on subsequent saves

The session title SHALL be re-evaluated on every `saveSession()` call. The candidate returned by `extractSessionTitle()` SHALL replace the current title unless the candidate is a truncated prefix of the current title (i.e., `candidate.length < current.length` AND `current.startsWith(candidate)`), in which case the longer current title SHALL be preserved.

`extractSessionTitle()` SHALL use the following priority order: `titleIntent` → Pass 1 (reverse scan for non-command human messages) → Pass 2 (reverse scan for command arguments) → Pass 3 (any non-noise user message). The `titleIntent` is only modified by `setTitleIntent()`, never cleared by `extractSessionTitle()`.

#### Scenario: Title updates when topic shifts

- **WHEN** a session's current title is "fix session title extraction bug" (derived from a command argument) and `extractSessionTitle()` returns "The real bug is in isTitleBetter" (from a later non-command message)
- **THEN** on the next `saveSession()`, the title SHALL update to "The real bug is in isTitleBetter"

#### Scenario: Title stays when candidate is truncated prefix of current

- **WHEN** a session's current title is "Debug session manager title extraction logic" and `extractSessionTitle()` returns "Debug session manager" (a shorter prefix of the current title)
- **THEN** on the next `saveSession()`, the title SHALL remain "Debug session manager title extraction logic"

#### Scenario: Title updates when candidate is different but shorter

- **WHEN** a session's current title is "I want to fix the session title extraction. The regex doesn't" (60 chars, truncated) and `extractSessionTitle()` returns "Actually the bug is in isTitleBetter" (35 chars)
- **THEN** on the next `saveSession()`, the title SHALL update to "Actually the bug is in isTitleBetter" because the candidate is not a prefix of the current title

#### Scenario: Placeholder always replaced

- **WHEN** a session's current title is "New session" and `extractSessionTitle()` returns any valid candidate
- **THEN** the title SHALL be replaced with the candidate

#### Scenario: titleIntent preserves title across multiple saves

- **WHEN** a session's title is set from `titleIntent` (e.g., "MCP progress"), and `saveSession` is called again with no new human messages
- **THEN** the title SHALL remain "MCP progress" and SHALL NOT be overwritten by injected system instruction text from Pass 1
