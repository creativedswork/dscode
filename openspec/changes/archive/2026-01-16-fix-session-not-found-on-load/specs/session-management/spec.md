## ADDED Requirements

### Requirement: handleSession load fallback to current session

The `WebUiBackend.handleSession` `"load"` handler SHALL, when `listSessions()` returns zero matches for the requested session ID, check whether the request ID matches the current active session via `sessionManager.getCurrentMetadata()`. If the current session metadata exists and its `id` starts with the requested ID prefix, the handler SHALL proceed with loading the current session instead of returning a "Session not found" error.

This ensures consistency with `pushSessionList()`, which already includes the current session in the client-facing list even when its `messageCount` is 0.

#### Scenario: Load current empty session via sidebar click

- **WHEN** the client sends `{ type: "session", action: "load", id: "<currentSessionId>" }` and the current session has `messageCount === 0` (thus excluded from `listSessions()` output)
- **THEN** the handler finds no match in `listSessions()` but detects that `getCurrentMetadata()?.id` starts with the requested ID
- **AND** proceeds with the normal load flow (abort → save → loadSession → clear_conversation → ready)
- **AND** does NOT return "Session not found" error

#### Scenario: Load non-existent session still returns error

- **WHEN** the client sends `{ type: "session", action: "load", id: "NONEXIST" }` and no session with that ID exists (neither in `listSessions()` nor as current session)
- **THEN** the handler returns `{ type: "error", text: "Session not found: NONEXIST" }`

#### Scenario: Ambiguous prefix match still returns error

- **WHEN** the client sends `{ type: "session", action: "load", id: "00" }` and `listSessions()` matches more than one session with that prefix
- **THEN** the handler returns `{ type: "error", text: "Ambiguous session ID prefix. ..." }` without checking the current session fallback

### Requirement: rebuildIndex preserves empty-message sessions

`SessionStore.rebuildIndex()` SHALL include session files with `messages.length === 0` in the rebuilt index, as long as the file contains valid `metadata` with a valid `id` field. Only files that fail to parse as valid JSON or lack valid `metadata.id` SHALL be skipped.

The existing fix-up for `messageCount === 0 && messages.length > 0` SHALL remain unchanged.

#### Scenario: Empty session preserved in rebuilt index

- **WHEN** `rebuildIndex()` scans a directory containing a valid session file with `messages: []` and valid metadata
- **THEN** that session SHALL appear in the rebuilt index with its original metadata

#### Scenario: Corrupted session file still skipped

- **WHEN** `rebuildIndex()` scans a directory containing a file with invalid JSON or missing `metadata.id`
- **THEN** that file SHALL be silently skipped

## MODIFIED Requirements

### Requirement: Current session preserved in list when empty

- **WHEN** the current active session has `messageCount === 0`
- **THEN** that session is excluded from `listSessions()` output; the `pushSessionList` server method adds it back when sending to the client, using `currentSessionId` to identify it; the `handleSession` `"load"` handler also falls back to `getCurrentMetadata()` when `listSessions()` returns no matches
