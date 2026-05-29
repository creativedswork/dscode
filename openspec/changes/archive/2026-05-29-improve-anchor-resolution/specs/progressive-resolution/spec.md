## ADDED Requirements

### Requirement: edit tool uses display hash and resolution hash
The system SHALL use a two-tier hash scheme: a 6-character display hash (visible in read_file output and accepted as input by edit) and an 8-character internal resolution hash. The display hash SHALL be the first 6 hex characters of MD5(line.trim()). The resolution hash SHALL be the first 8 hex characters of the same digest. When an edit operation provides a 6-character hash, the system SHALL first attempt to match using the full 8-character resolution hash internally.

#### Scenario: display hash is 6 characters
- **WHEN** `read_file(hashes: true)` returns hashed lines
- **THEN** each displayed hash SHALL be exactly 6 hex characters

#### Scenario: edit accepts 6-character hash
- **WHEN** the model calls `edit` with a 6-character hash
- **THEN** the tool SHALL internally use the 8-character resolution hash for matching

### Requirement: Adaptive hash length resolution in edit tool
When the 6-character display hash matches multiple lines in the current file, the edit tool SHALL automatically attempt to resolve the ambiguity by comparing the full 8-character resolution hash. If the 8-character hash is also ambiguous, the tool SHALL attempt context-augmented matching using the target line's neighboring lines. Only when all disambiguation levels fail SHALL the tool return an error.

#### Scenario: 6-char hash ambiguous but 8-char hash unique
- **WHEN** the model calls `edit` with `hash: "a1b2c3"` which matches 2 lines based on 6-char comparison
- **AND** the first matching line's full 8-char resolution hash is `"a1b2c3d4"` and the second is `"a1b2c3e5"`
- **AND** the model's intended target corresponds to `"a1b2c3d4"`
- **THEN** the tool SHALL internally resolve to the `"a1b2c3d4"` line without returning an ambiguity error

#### Scenario: Both 6-char and 8-char hash ambiguous, context resolves
- **WHEN** the model calls `edit` with a hash that matches 2 lines even at 8-char level
- **AND** the target line's `prev_nonempty + current + next_nonempty` context produces a unique match
- **THEN** the tool SHALL internally resolve using context-augmented matching without returning an error

#### Scenario: All disambiguation levels fail
- **WHEN** the model calls `edit` with a hash that matches 3 lines at all levels (6-char, 8-char, and context-augmented)
- **THEN** the tool SHALL return error `anchor_context_ambiguous` with all candidate line numbers and a `suggested_action` of `"re-read_with_context"`

### Requirement: Context-augmented identity for lines
Each line's identity SHALL be computed from a three-line window: the previous non-empty line, the current line, and the next non-empty line, joined by newlines. If the line is the first or last in the file, the missing neighbor SHALL be represented as an empty string.

#### Scenario: Context identity for a middle line
- **WHEN** computing the context identity for line 5 with trimmed content `  return result;`
- **AND** the previous non-empty line (line 3) has trimmed content `  const x = compute();`
- **AND** the next non-empty line (line 6) has trimmed content `}`
- **THEN** the context identity input SHALL be `"  const x = compute();\n  return result;\n}"`

#### Scenario: Context identity for first line
- **WHEN** computing the context identity for line 1
- **THEN** the previous non-empty line SHALL be represented as an empty string (resulting in `"\n<line1>\n<next>"`)

#### Scenario: Context identity skips empty neighboring lines
- **WHEN** computing the context identity for line 10, and line 9 is empty, and line 8 is non-empty
- **THEN** the previous non-empty neighbor SHALL be line 8 (skipping the empty line 9)

### Requirement: Resolution ladder produces structured errors at each level
When the resolution ladder exhausts all disambiguation levels, the error response SHALL indicate which level failed, list all candidate matches, and suggest a specific recovery action. The system SHALL distinguish between `anchor_prefix_ambiguous` (hash-level ambiguity) and `anchor_context_ambiguous` (context-level ambiguity).

#### Scenario: Prefix-level ambiguity error
- **WHEN** the 6-char and 8-char hashes both match 4 candidate lines, and context-augmented matching is not yet attempted
- **THEN** the error SHALL be `anchor_prefix_ambiguous` with `suggested_action: "use_context_anchor"`

#### Scenario: Context-level ambiguity error
- **WHEN** all disambiguation levels (6-char, 8-char, context-augmented) fail
- **THEN** the error SHALL be `anchor_context_ambiguous` with `suggested_action: "re-read_with_context"` and SHALL include `candidates` with line numbers and content previews for each match
