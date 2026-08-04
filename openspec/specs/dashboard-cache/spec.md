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

### Requirement: Cache hit triggers instant view switch
When a dashboard cache hit occurs on view mode switch, the view mode SHALL switch instantly without triggering the transition animation.

#### Scenario: Cache hit bypasses transition
- **WHEN** user selects "Dashboard" and a valid cache entry exists for the current session with matching contentHash
- **THEN** the frontend SHALL set `artifactHtml` to the cached HTML
- **AND** `viewMode` SHALL be set to `"dashboard"` immediately
- **AND** `transitionPhase` SHALL remain `"idle"` (no animation plays)
- **AND** no `artifact generate` command SHALL be sent
- **AND** the View Mode dropdown SHALL update to show "Dashboard" as selected

### Requirement: Dashboard content hash includes SubAgent records
The Session `contentHash` used for Dashboard cache validation SHALL be derived from a
stable projection of both Main Agent messages and persisted `agentMessages`, plus a
Dashboard format-version marker.

#### Scenario: SubAgent completion invalidates current Session cache
- **WHEN** a SubAgent terminal record is added to the current Session without changing Main Agent messages
- **THEN** the Session `contentHash` changes on save
- **AND** a Dashboard cache entry created before the SubAgent completion no longer matches

#### Scenario: Background completion invalidates non-current Session cache
- **WHEN** a background SubAgent terminal record is upserted into a Session that is not currently visible
- **THEN** that stored Session's metadata receives a new `contentHash`
- **AND** loading that Session and switching to Dashboard triggers regeneration instead of using the older cached artifact

#### Scenario: Stable data produces stable hash
- **WHEN** Main Agent messages and `agentMessages` are unchanged across repeated saves
- **THEN** the computed `contentHash` remains identical

#### Scenario: SubAgent outcome affects hash
- **WHEN** two otherwise identical Agent records differ in Application, state, timing, input summary, output, or error
- **THEN** their Dashboard content hashes differ

#### Scenario: Legacy Session without Agent records
- **WHEN** a v1 or v2 Session has no `agentMessages`
- **THEN** Dashboard content hashing succeeds with an empty Agent record projection
- **AND** no Session format migration is required solely to compute the hash

#### Scenario: Dashboard presentation contract changes
- **WHEN** the Dashboard format-version marker changes
- **THEN** the Session `contentHash` changes even if Main messages and `agentMessages` are unchanged
- **AND** cached HTML generated under the previous presentation contract is regenerated
