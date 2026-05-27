## ADDED Requirements

### Requirement: Edit tool read_file returns anchor_format_version
The `read_file` tool with `hashes: true` SHALL include `anchor_format_version` in its `details` field. This string identifies the anchor protocol version in use, allowing the agent to detect format changes and react accordingly (e.g., forcing a re-read after protocol upgrades).

#### Scenario: read_file with hashes returns anchor format version
- **WHEN** the model calls `read_file` with `hashes: true`
- **THEN** details SHALL contain `anchor_format_version` with a string value (e.g., `"v2"`) indicating the current anchor protocol version

#### Scenario: read_file without hashes omits anchor format version
- **WHEN** the model calls `read_file` without `hashes: true`
- **THEN** details SHALL NOT include `anchor_format_version`

### Requirement: Hashline hash is content-only (line number excluded from identity)
The hash value for each line SHALL be computed from the line's trimmed content only (`MD5(line.trim()).slice(0, 4)`). The line number SHALL NOT be included in the hash computation. This ensures that upstream insertions or deletions do not invalidate anchors for unchanged lines downstream.

#### Scenario: Same content at different positions produces same hash
- **WHEN** a file contains identical trimmed content `}` at line 10 and line 20
- **THEN** the hash for line 10 SHALL be identical to the hash for line 20

#### Scenario: Line insertion does not invalidate downstream anchors
- **WHEN** a new line is inserted at line 5 of a file
- **THEN** the hashes for lines that previously appeared at lines 6+ SHALL remain unchanged (only their displayed line numbers change)

### Requirement: Anchor format uses lineNumber#hash prefix
The display format for hashed lines SHALL be `lineNumber#hash|content` where `lineNumber` is the 1-indexed advisory snapshot position and `hash` is the 4-character content-only identity digest. The line number provides human-readable and model-readable context for the snapshot position but is NOT authoritative for identity matching.

#### Scenario: Hashed line output format
- **WHEN** `read_file(hashes: true)` outputs a line
- **THEN** each line SHALL follow the format `N#XXXX|content` where N is the advisory line number and XXXX is the content hash

## MODIFIED Requirements

### Requirement: read_file supports hashline output mode

The `read_file` tool SHALL accept an optional boolean parameter `hashes`. When `hashes` is `true`, each output line MUST be prefixed with `行号#哈希|` where 哈希 is a 4-character hexadecimal string derived from the line's trimmed content (NOT combined with line number). The tool SHALL also return `anchor_format_version` and `file_version` in its details.

#### Scenario: read_file with hashes enabled
- **WHEN** the model calls `read_file` with `path: "/path/to/file.ts"` and `hashes: true`
- **THEN** each line in the output MUST follow the format `N#XXXX|content` where N is the 1-indexed advisory line number and XXXX is a 4-character content-only hex hash; details MUST contain `file_version` and `anchor_format_version`

#### Scenario: read_file with hashes disabled (default)
- **WHEN** the model calls `read_file` with `hashes: false` or omits the `hashes` parameter
- **THEN** the output format SHALL remain unchanged from the current numbered-line format (`N\tcontent`)

#### Scenario: read_file with hashes on an empty file
- **WHEN** the model calls `read_file` with `hashes: true` on a file with zero lines
- **THEN** the output SHALL indicate the file is empty with no hash lines

### Requirement: Hashline hash is deterministic and content-based

The hash value for each line SHALL be computed as the first 4 hex characters of `MD5(line.trim())`. The same line content at any line number MUST produce the same hash.

#### Scenario: Same content same hash regardless of line number
- **WHEN** two different read_file calls read a file where line 5 and a later read where the same content appears at line 12
- **THEN** both calls MUST output the same 4-character hash for that content

#### Scenario: Different content different hash
- **WHEN** two lines contain different trimmed content
- **THEN** the resulting hashes MUST be different (barring the negligible collision probability)

#### Scenario: Same content creates hash collision intentionally
- **WHEN** a file contains the identical trimmed content `}` at multiple lines
- **THEN** all such lines SHALL share the same hash; disambiguation is handled via the `occurrence` field or `anchor_ambiguous` error at edit time, not via hash uniqueness

### Requirement: File summary line reflects hash mode

When `hashes: true`, the file summary line (displayed when the file exceeds the read limit) SHALL indicate that hashes are active, and the file path, total line count, and `file_version` SHALL still be reported.

#### Scenario: Partial read with hashes
- **WHEN** a 500-line file is read with `hashes: true, limit: 200`
- **THEN** the output SHALL include a summary line indicating total lines (500), that hashes are enabled for the shown range, and the `file_version`
