## ADDED Requirements

### Requirement: Dashboard cache storage in localStorage
The frontend SHALL persist generated dashboard HTML to localStorage under the key `dscode-dash-cache`. Each entry SHALL be keyed by session ID and contain:
- `contentHash`: the session content hash at the time of generation
- `html`: the complete dashboard HTML string

#### Scenario: Cache written on artifact_end
- **WHEN** the server sends an `artifact_end` event for a `session_dashboard` artifact
- **AND** the `currentSessionId` is non-null
- **THEN** the frontend SHALL store `{ contentHash: <session.contentHash>, html: <artifactHtml> }` in the cache under the current session ID
- **AND** persist the updated cache to localStorage

#### Scenario: Cache structure
- **WHEN** the dashboard cache contains entries for two sessions
- **THEN** the localStorage value SHALL be a JSON object of shape `{ "<sessionIdA>": { contentHash, html }, "<sessionIdB>": { contentHash, html } }`

### Requirement: Dashboard cache hit on view mode switch
When the user switches to Dashboard mode, the frontend SHALL check the cache before sending an `artifact generate` command.

#### Scenario: Cache hit — instant render
- **WHEN** the user switches to Dashboard mode for the current session
- **AND** the cache contains an entry for `currentSessionId`
- **AND** `cache[].contentHash` equals the session's current `contentHash` from `SessionInfo`
- **THEN** the frontend SHALL set `artifactHtml` to the cached HTML
- **AND** set `artifactLoading` to `false`
- **AND** NOT send an `artifact generate` command

#### Scenario: Cache miss — regenerate
- **WHEN** the user switches to Dashboard mode for the current session
- **AND** the cache does NOT contain an entry for `currentSessionId`, OR the cached `contentHash` differs from the session's current `contentHash`
- **THEN** the frontend SHALL clear `artifactHtml`, set `artifactLoading` to `true`, and send `{ type: "artifact", action: "generate", context: "session_dashboard" }`

#### Scenario: No session — no cache check
- **WHEN** the user switches to Dashboard mode and `currentSessionId` is null
- **THEN** the frontend SHALL proceed with normal generate flow without checking cache

### Requirement: Dashboard cache survives page reload
The frontend SHALL load the dashboard cache from localStorage on initialization.

#### Scenario: Cache loaded on mount
- **WHEN** the App component mounts
- **THEN** the frontend SHALL read `dscode-dash-cache` from localStorage
- **AND** initialize the in-memory cache ref with parsed data (or empty object if missing/invalid)

### Requirement: Dashboard cache bounded to 20 entries
The frontend SHALL limit the dashboard cache to the 20 most recently used session entries. When adding a new entry would exceed 20, the oldest entry (by access order) SHALL be evicted.

#### Scenario: Cache eviction on overflow
- **WHEN** the cache already contains 20 entries and a new session's dashboard is cached
- **THEN** the oldest entry SHALL be removed before the new entry is added
