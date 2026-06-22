## ADDED Requirements

### Requirement: Session content hash computation
When `SessionManager.saveSession()` is called, the session manager SHALL compute a content hash from the serialized messages and store it in `SessionMetadata.contentHash`.

#### Scenario: contentHash computed on save
- **WHEN** `saveSession()` is called with an agent that has messages
- **THEN** the method SHALL compute a SHA-256 hash of the concatenated message role and first 200 characters of each message's content string
- **AND** store the first 12 hexadecimal characters of the hash in `this.current.contentHash`

#### Scenario: contentHash persisted to disk
- **WHEN** a session is saved to disk via `SessionStore.save()`
- **THEN** the serialized JSON SHALL include `contentHash` in the `metadata` object

#### Scenario: contentHash stable for identical content
- **WHEN** `saveSession()` is called twice on the same set of messages
- **THEN** the resulting `contentHash` SHALL be identical both times

#### Scenario: contentHash changes when content changes
- **WHEN** a new message is added to the conversation and `saveSession()` is called again
- **THEN** the resulting `contentHash` SHALL differ from the previous call's hash

### Requirement: contentHash exposed in SessionInfo
The `WebUiBackend.handleSession("list")` handler SHALL include the `contentHash` field when mapping `SessionMetadata` to `SessionInfo` for the frontend.

#### Scenario: contentHash in session list response
- **WHEN** the client sends `{ type: "session", action: "list" }`
- **THEN** each entry in the `sessions` event SHALL include a `contentHash` field from the session metadata

#### Scenario: contentHash included in SessionInfo type
- **WHEN** the `SessionInfo` TypeScript type is defined in `src/ui/shared/types.ts`
- **THEN** it SHALL include a `contentHash: string` field
