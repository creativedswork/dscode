# anchor-entropy-filter Specification

## Purpose
TBD - created by archiving change improve-anchor-resolution. Update Purpose after archive.
## Requirements
### Requirement: Low-entropy lines are classified with a quality score
The system SHALL classify each line into one of three quality tiers: `low`, `medium`, or `high`. The classification SHALL be based on the trimmed line content and the file-wide occurrence frequency of that content. The classification MUST be deterministic and reproducible for the same line content in the same file context.

#### Scenario: Empty line classified as low
- **WHEN** a line's trimmed content is the empty string ""
- **THEN** the line SHALL be classified as `low`

#### Scenario: Structural punctuation line classified as low
- **WHEN** a line's trimmed content consists solely of characters in the set `{}()[],;` possibly with whitespace between them (e.g., `},`, `);`, `}`, `{`)
- **THEN** the line SHALL be classified as `low`

#### Scenario: High-identifier line classified as high
- **WHEN** a line's trimmed content contains at least one alphanumeric identifier of 3+ characters (e.g., `name: "memory"`, `function handleClick()`)
- **AND** the line is not classified as low by structural rules
- **AND** the line's content-only hash appears 3 or fewer times in the file
- **THEN** the line SHALL be classified as `high`

#### Scenario: Frequently repeated line classified as medium
- **WHEN** a line's trimmed content is not classified as low by structural rules
- **BUT** the line's content-only hash appears more than 3 times in the file
- **THEN** the line SHALL be classified as `medium`

### Requirement: Low-entropy lines are rejected as bare primary anchors in single-line operations
Single-line edit operations (replace_line, insert_after, insert_before, delete_line) SHALL be rejected if the target hash resolves to a line classified as `low`, regardless of whether the hash is unique. The error SHALL suggest using a neighboring high-quality line as anchor or switching to a range operation.

#### Scenario: Single-line replace targeting low-entropy line rejected
- **WHEN** the model calls `edit` with `op: "replace_line"` and a hash that uniquely resolves to a line classified as `low` (e.g., `},`)
- **THEN** the edit SHALL be rejected with error `anchor_low_entropy`, and details SHALL include the line number and suggested neighboring high-quality anchors

#### Scenario: Single-line insert_after targeting low-entropy line rejected
- **WHEN** the model calls `edit` with `op: "insert_after"` and a hash that resolves to a `low` line
- **THEN** the edit SHALL be rejected with error `anchor_low_entropy`

#### Scenario: Low-entropy line allowed as auxiliary in range operations
- **WHEN** the model calls `edit` with `op: "replace_range"` where `start_hash` is a high-quality unique anchor and `end_hash` is a low-entropy unique anchor
- **THEN** the operation SHALL execute normally (range ops allow low-entropy endpoints since they serve as boundary markers, not primary identity carriers)

#### Scenario: Range operation with low-entropy start_hash still requires uniqueness
- **WHEN** the model calls `edit` with `op: "replace_range"` where `start_hash` is a low-entropy hash matching 3 candidate lines
- **THEN** the edit SHALL be rejected with error `anchor_ambiguous` (uniqueness still required regardless of entropy class)

### Requirement: read_file output annotates line quality
When `read_file(hashes: true)` is called, each line SHALL include a quality annotation in the format `[quality]` where quality is `low`, `med`, or `high`. The annotation SHALL appear between the hash and the content separator. The `details` object SHALL include a `recommended_anchors` array containing up to 20 `"lineNum#hash"` strings for lines classified as `high`.

#### Scenario: Hashed line output with quality annotation
- **WHEN** `read_file(hashes: true)` outputs a line with content `  name: "memory",` classified as high
- **THEN** the output format SHALL be `119#c812f1 [high]   name: "memory",`

#### Scenario: Hashed line output for low-entropy line
- **WHEN** `read_file(hashes: true)` outputs a line with content `  },` classified as low
- **THEN** the output format SHALL be `118#5da3f1 [low]   },`

#### Scenario: recommended_anchors in details
- **WHEN** `read_file(hashes: true)` reads a file with at least 3 high-quality lines
- **THEN** `details.recommended_anchors` SHALL be an array of `"lineNum#hash"` strings for high-quality lines, limited to 20 entries

