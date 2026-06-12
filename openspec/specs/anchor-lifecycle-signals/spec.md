## ADDED Requirements

### Requirement: write_file returns anchor invalidation signal

Upon successful completion, the `write_file` tool SHALL include in its result an `anchors_invalidated` field set to `true` and a `hint` field containing a human-readable reminder that all previous hash anchors for this file are invalid and must be re-read before calling `edit`. The result SHALL also include `preview_anchors`, an array of up to 10 anchor objects from the first lines of the newly written file, each containing `line` (1-indexed), `hash` (6-char hex), and `content_preview` (truncated to 60 characters). Only lines classified as `high` quality SHALL be included in `preview_anchors`; if fewer than 10 high-quality lines exist in the first portion of the file, fewer anchors SHALL be returned.

#### Scenario: write_file returns anchors_invalidated with preview
- **WHEN** `write_file` successfully writes a 100-line file with 8 high-quality lines in the first 30 lines
- **THEN** the result SHALL include `anchors_invalidated: true`
- **AND** `hint` SHALL contain text instructing to re-read with `read_file({ hashes: true })` before calling `edit`
- **AND** `preview_anchors` SHALL be an array of 8 objects, each with `line`, `hash`, and `content_preview`

#### Scenario: write_file on small file with few high-quality lines
- **WHEN** `write_file` successfully writes a 5-line file with only 1 high-quality line
- **THEN** `preview_anchors` SHALL contain exactly 1 entry

#### Scenario: write_file on empty file
- **WHEN** `write_file` successfully writes an empty file (0 lines)
- **THEN** `anchors_invalidated` SHALL be `true`
- **AND** `preview_anchors` SHALL be an empty array
- **AND** `hint` SHALL still be present

### Requirement: overwrite_file returns anchor invalidation signal

Upon successful completion, the `overwrite_file` tool SHALL include the same `anchors_invalidated`, `hint`, and `preview_anchors` fields as `write_file`, with identical semantics and format.

#### Scenario: overwrite_file returns anchors_invalidated
- **WHEN** `overwrite_file` successfully overwrites an existing file
- **THEN** the result SHALL include `anchors_invalidated: true`
- **AND** `hint` and `preview_anchors` SHALL be present

### Requirement: Session context injects anchor invalidation reminder

After a `write_file` or `overwrite_file` call completes, the session context system SHALL store an anchor-invalidation event for the affected file path. On the NEXT model turn (before tool calls are made), the system SHALL inject a context notice into the conversation as a user turn prefix message. The notice SHALL NOT modify the system prompt. The notice SHALL include the file path, new line count, and file version. After the notice is injected, the invalidation event SHALL be consumed (removed from the store) to prevent repeated injection.

#### Scenario: Anchor invalidation injected in next turn
- **WHEN** the model calls `write_file` on `/app/foo.ts` in turn N
- **AND** turn N+1 begins
- **THEN** the conversation for turn N+1 SHALL include a user-message notice identifying `/app/foo.ts` as freshly rewritten
- **AND** the notice SHALL reference `read_file({ path: "/app/foo.ts", hashes: true })` as the required next step before editing

#### Scenario: No invalidation injected when no write_file occurred
- **WHEN** the model only uses `edit` (no `write_file` or `overwrite_file`) in turn N
- **THEN** turn N+1 SHALL NOT contain an anchor invalidation notice

#### Scenario: Invalidation event consumed after one injection
- **WHEN** an anchor-invalidation event is injected in turn N+1
- **THEN** turn N+2 SHALL NOT contain a duplicate notice for the same file (unless a new write_file occurred)

#### Scenario: Multiple files invalidated
- **WHEN** the model calls `write_file` on `/app/a.ts` and `/app/b.ts` in the same turn
- **THEN** turn N+1 conversation SHALL include invalidation notices for both files

### Requirement: edit tool does NOT trigger anchor invalidation events

The `edit` tool SHALL NOT create anchor-invalidation events in the session context store. Only `write_file` and `overwrite_file` (full file rewrites) trigger the invalidation mechanism.

### Requirement: Anchor invalidation notices MUST NOT modify the system prompt

The injection of anchor invalidation notices SHALL occur in the conversation layer (as a user turn prefix message), NOT by modifying the system prompt. The system prompt SHALL remain static across all turns to preserve LLM API prompt prefix caching. Any mechanism that dynamically alters the system prompt content between turns SHALL be rejected.

#### Scenario: System prompt unchanged after invalidation notice
- **WHEN** an anchor-invalidation notice is injected in turn N+1
- **THEN** the system prompt content for turn N+1 SHALL be identical to that of turn N
- **AND** the notice SHALL appear as part of the conversation messages, not the system prompt

#### Scenario: Multiple invalidation notices do not alter system prompt
- **WHEN** write_file is called on 3 files in one turn
- **THEN** turn N+1 system prompt SHALL remain unchanged
- **AND** all 3 notices SHALL appear in the conversation layer only

#### Scenario: edit does not cause invalidation notice
- **WHEN** the model calls `edit` to modify a file
- **THEN** the next turn SHALL NOT contain an anchor invalidation notice for that file
