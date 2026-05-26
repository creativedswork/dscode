## ADDED Requirements

### Requirement: read_file supports hashline output mode

The `read_file` tool SHALL accept an optional boolean parameter `hashes`. When `hashes` is `true`, each output line MUST be prefixed with `行号:哈希|` where 哈希 is a 4-character hexadecimal string derived from the line's trimmed content combined with its 1-indexed line number.

#### Scenario: read_file with hashes enabled
- **WHEN** the model calls `read_file` with `path: "/path/to/file.ts"` and `hashes: true`
- **THEN** each line in the output MUST follow the format `N:XXXX|content` where N is the 1-indexed line number and XXXX is a 4-character hex hash

#### Scenario: read_file with hashes disabled (default)
- **WHEN** the model calls `read_file` with `hashes: false` or omits the `hashes` parameter
- **THEN** the output format SHALL remain unchanged from the current numbered-line format (`N\tcontent`)

#### Scenario: read_file with hashes on an empty file
- **WHEN** the model calls `read_file` with `hashes: true` on a file with zero lines
- **THEN** the output SHALL indicate the file is empty with no hash lines

### Requirement: Hashline hash is deterministic and content-based

The hash value for each line SHALL be computed as the first 4 hex characters of `MD5(line.trim() + "|" + lineNumber)` where `lineNumber` is 1-indexed. The same line content at the same line number MUST always produce the same hash.

#### Scenario: Same content same line number produces same hash
- **WHEN** two different read_file calls read a file where line 5 contains `  return x;  ` (with surrounding whitespace)
- **THEN** both calls MUST output the same 4-character hash for line 5

#### Scenario: Same content different line numbers produce different hashes
- **WHEN** a file contains the identical content `}` at line 10 and line 20
- **THEN** the hash for line 10 MUST differ from the hash for line 20

#### Scenario: Different content different hash
- **WHEN** two lines contain different trimmed content
- **THEN** the resulting hashes MUST be different (barring the negligible 16-bit collision probability)

### Requirement: File summary line reflects hash mode

When `hashes: true`, the file summary line (displayed when the file exceeds the read limit) SHALL indicate that hashes are active, and the file path and total line count SHALL still be reported.

#### Scenario: Partial read with hashes
- **WHEN** a 500-line file is read with `hashes: true, limit: 200`
- **THEN** the output SHALL include a summary line indicating total lines (500) and that hashes are enabled for the shown range
