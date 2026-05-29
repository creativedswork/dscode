## MODIFIED Requirements

### Requirement: Single-line operations reject ambiguous anchors
When a single-line edit operation (replace_line, insert_after, insert_before, delete_line) references a hash that matches multiple candidate lines in the current file, the edit SHALL attempt progressive disambiguation: 6-char hash → 8-char resolution hash → context-augmented matching. Only when all levels fail SHALL the edit be rejected with error `anchor_context_ambiguous`. If the hash matches multiple lines AND the target line is classified as low-entropy, the edit SHALL also be rejected with `anchor_low_entropy` regardless of uniqueness.

#### Scenario: Ambiguous single-line operation resolved by 8-char hash
- **WHEN** the model calls `edit` with `op: "replace_line"`, `hash: "d41d00"` where `d41d00` matches 3 distinct empty lines at 6-char level
- **AND** the 8-char resolution hash uniquely identifies the intended line
- **THEN** the tool SHALL resolve silently and the operation SHALL succeed

#### Scenario: Ambiguous single-line operation resolved by context
- **WHEN** the model calls `edit` with a hash that matches 2 lines at both 6-char and 8-char levels
- **AND** the context-augmented hash uniquely identifies the intended line
- **THEN** the tool SHALL resolve silently and the operation SHALL succeed

#### Scenario: Ambiguous single-line operation fails all levels
- **WHEN** the model calls `edit` with a hash that matches 3 lines at all levels (6-char, 8-char, context)
- **THEN** the batch SHALL be rejected with error `anchor_context_ambiguous`, and the error details SHALL include the hash and all candidate line numbers with content previews

#### Scenario: Single-line operation with low-entropy target rejected
- **WHEN** the model calls `edit` with `op: "replace_line"` and a hash that resolves to a line classified as `low`
- **THEN** the batch SHALL be rejected with error `anchor_low_entropy` and details SHALL include neighboring high-quality anchors as alternatives

### Requirement: Range operations reject ambiguous endpoint anchors
When a range edit operation (delete_range, replace_range) has a start_hash or end_hash that matches multiple candidate lines after all disambiguation levels (6-char → 8-char → context), the edit SHALL be rejected with error `anchor_context_ambiguous`. Range operations SHALL NOT support occurrence-based disambiguation but SHALL benefit from progressive resolution.

#### Scenario: Range operation with ambiguous start anchor after all levels
- **WHEN** the model calls `edit` with `op: "delete_range"`, `start_hash` matching 3 candidate lines at all resolution levels, and `end_hash` matching exactly 1 line
- **THEN** the batch SHALL be rejected with error `anchor_context_ambiguous`, and details SHALL identify `start_hash` as the ambiguous anchor with all candidate line numbers and content previews

#### Scenario: Range operation with ambiguous end anchor after all levels
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash` matching exactly 1 line, and `end_hash` matching 4 candidate lines at all resolution levels
- **THEN** the batch SHALL be rejected with error `anchor_context_ambiguous`, and details SHALL identify `end_hash` as the ambiguous anchor

#### Scenario: Range operation resolves via progressive disambiguation
- **WHEN** the model calls `edit` with `op: "replace_range"`, `start_hash` matching 2 lines at 6-char level but unique at 8-char level, and `end_hash` unique at all levels
- **THEN** the tool SHALL resolve `start_hash` via 8-char hash and the operation SHALL execute normally

### Requirement: anchor_ambiguous error includes structured candidate information
When an ambiguity error is returned after all resolution levels are exhausted, the error details SHALL include the ambiguous hash(es), all candidate line numbers, a content preview for each candidate, and a `suggested_action` field. The error code SHALL be `anchor_context_ambiguous` to distinguish it from prefix-level ambiguity.

#### Scenario: Structured context ambiguity error
- **WHEN** `edit` returns `anchor_context_ambiguous` for a batch with hash `"d41d00"` matching lines 3, 7, and 15 at all resolution levels
- **THEN** details SHALL contain `ambiguous_anchors: [{hash: "d41d00", candidates: [{line: 3, preview: "  },"}, {line: 7, preview: "  },"}, {line: 15, preview: "  },"}]}]` and `suggested_action: "re-read_with_context"`

## ADDED Requirements

### Requirement: Progressive resolution ladder
The edit tool SHALL implement a resolution ladder that attempts increasingly precise disambiguation before returning an error. The ladder steps SHALL be: (1) match 6-char display hash, (2) match 8-char resolution hash, (3) match context-augmented hash using the three-line window. Each step SHALL be attempted transparently without agent involvement. Only when all steps fail SHALL the tool return an error.

#### Scenario: Resolution ladder step 1 succeeds
- **WHEN** a 6-char hash is unique in the file
- **THEN** the tool SHALL resolve at step 1 and proceed without further checks

#### Scenario: Resolution ladder step 2 succeeds
- **WHEN** a 6-char hash is ambiguous but the 8-char resolution hash is unique
- **THEN** the tool SHALL resolve at step 2 without returning an error

#### Scenario: Resolution ladder step 3 succeeds
- **WHEN** both 6-char and 8-char hashes are ambiguous but context-augmented matching produces a unique result
- **THEN** the tool SHALL resolve at step 3 without returning an error

#### Scenario: Resolution ladder exhausts all steps
- **WHEN** all three steps (6-char, 8-char, context) produce ambiguous results
- **THEN** the tool SHALL return error `anchor_context_ambiguous`
