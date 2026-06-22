## MODIFIED Requirements

### Requirement: Dashboard re-generates on each switch
Each time the user switches from Chat to Dashboard, the frontend SHALL send a fresh `artifact generate` command UNLESS a valid cached dashboard exists for the current session (cached `contentHash` matches the session's current `contentHash`). Previously rendered artifact content from a different session SHALL be discarded.

#### Scenario: Fresh dashboard on switch when no cache
- **WHEN** the user is in Dashboard mode, switches to Chat, then back to Dashboard
- **AND** no valid cache entry exists for the current session
- **THEN** the previous artifact HTML is discarded and a new `artifact generate` command is sent

#### Scenario: Cached dashboard used on switch
- **WHEN** the user is in Dashboard mode, switches to Chat, then back to Dashboard
- **AND** a valid cache entry exists for the current session (contentHash matches)
- **THEN** the cached HTML is rendered immediately
- **AND** no `artifact generate` command is sent
