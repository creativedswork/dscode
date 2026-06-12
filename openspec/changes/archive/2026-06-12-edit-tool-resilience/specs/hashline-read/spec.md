## MODIFIED Requirements

### Requirement: read_file supports hashline output mode

The `read_file` tool SHALL accept an optional boolean parameter `hashes`. When `hashes` is `true`, each output line MUST be prefixed with `行号#哈希|` where 哈希 is a 6-character hexadecimal string derived from the line's trimmed content (NOT combined with line number). The tool SHALL also return `anchor_format_version`, `file_version`, and `recommended_anchors` in its details. Each line SHALL include a quality annotation `[quality]` between the hash and the content. Lines classified as `low` quality SHALL include an `occurrences=N` count and a `WARNING:ambiguous_anchor` marker when the hash repeats in the file.

#### Scenario: read_file with hashes enabled
- **WHEN** the model calls `read_file` with `path: "/path/to/file.ts"` and `hashes: true`
- **THEN** each line in the output MUST follow the format `N#XXXXXX [quality]|content` where N is the 1-indexed advisory line number, XXXXXX is a 6-character content-only hex hash, and quality is `low`, `med`, or `high`; details MUST contain `file_version`, `anchor_format_version` (value `"v3"`), and `recommended_anchors`

#### Scenario: read_file with hashes disabled (default)
- **WHEN** the model calls `read_file` with `hashes: false` or omits the `hashes` parameter
- **THEN** the output format SHALL remain unchanged from the current numbered-line format (`N\tcontent`)

#### Scenario: read_file with hashes on an empty file
- **WHEN** the model calls `read_file` with `hashes: true` on a file with zero lines
- **THEN** the output SHALL indicate the file is empty with no hash lines

#### Scenario: Low-entropy line format with occurrences and warning
- **WHEN** `read_file(hashes: true)` outputs a line classified as `low` with a hash that repeats 143 times in the file
- **THEN** the format SHALL be `17#cbb184 [low] occurrences=143 WARNING:ambiguous_anchor | }`

#### Scenario: High-entropy line with no warning
- **WHEN** `read_file(hashes: true)` outputs a line classified as `high` with a unique hash
- **THEN** the format SHALL be `119#c812f1 [high]   name: "memory",` with no occurrences or warning annotation

### Requirement: read_file returns recommended anchors in details

When `hashes: true`, the `details` object SHALL include a `recommended_anchors` array containing up to 20 `"lineNum#hash"` strings, each representing a line classified as `high` quality. These anchors are pre-validated as suitable for use in edit operations. The recommended_anchors SHALL be presented prominently at the end of the output, separated by a visual delimiter block titled "RECOMMENDED ANCHORS".

#### Scenario: recommended_anchors populated
- **WHEN** `read_file(hashes: true)` reads a 200-line file with 15 high-quality lines
- **THEN** `details.recommended_anchors` SHALL be an array of 15 `"lineNum#hash"` strings for those high-quality lines

#### Scenario: recommended_anchors capped at 20
- **WHEN** `read_file(hashes: true)` reads a file with 50 high-quality lines
- **THEN** `details.recommended_anchors` SHALL contain exactly 20 entries, selected to be evenly distributed across the file

#### Scenario: recommended_anchors visual presentation
- **WHEN** `read_file(hashes: true)` returns results
- **THEN** the output SHALL include a "RECOMMENDED ANCHORS" section with each anchor on its own line in `line N hash XXXXXX quality [high] N repeats` format
- **AND** the section SHALL be visually set apart from the file content (e.g., with delimiter lines)

### Requirement: Anchor format uses lineNumber#hash prefix

The display format for hashed lines SHALL be `lineNumber#hash [quality]|content` where `lineNumber` is the 1-indexed advisory snapshot position, `hash` is the 6-character content-only identity digest, and `quality` is the line's distinctiveness classification (`low`, `med`, or `high`). For `low` quality lines, the format SHALL additionally include `occurrences=N` and `WARNING:ambiguous_anchor` when the hash appears multiple times in the file. The line number provides human-readable and model-readable context for the snapshot position but is NOT authoritative for identity matching.

#### Scenario: Hashed line output format
- **WHEN** `read_file(hashes: true)` outputs a line
- **THEN** each line SHALL follow the format `N#XXXXXX [quality]|content` where N is the advisory line number, XXXXXX is the 6-char hash, and quality is the classification

#### Scenario: Low-entropy line format
- **WHEN** `read_file(hashes: true)` outputs a line classified as low
- **THEN** the format SHALL be `118#5da3f1 [low] occurrences=2 WARNING:ambiguous_anchor   },`

#### Scenario: High-entropy line format
- **WHEN** `read_file(hashes: true)` outputs a line classified as high
- **THEN** the format SHALL be `119#c812f1 [high]   name: "memory",`
