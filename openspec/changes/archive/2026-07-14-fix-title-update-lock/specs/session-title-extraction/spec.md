## MODIFIED Requirements

### Requirement: Update session title on subsequent saves

The session title SHALL be re-evaluated on every `saveSession()` call. The candidate returned by `extractSessionTitle()` SHALL replace the current title unless the candidate is a truncated prefix of the current title (i.e., `candidate.length < current.length` AND `current.startsWith(candidate)`), in which case the longer current title SHALL be preserved.

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
