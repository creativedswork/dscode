## ADDED Requirements

### Requirement: read_file details include checkpoint status when hashes enabled

When `hashes: true`, the `read_file` tool's `details` SHALL include `is_dirty: boolean` indicating whether the file has an uncommitted checkpoint, and `last_writer: string | null` indicating the type of the most recent writer for this file (`"edit"`, `"write_file"`, `"overwrite_file"`, `"bash"`, or `null` if never written in this session).

#### Scenario: read_file on clean file

- **WHEN** `read_file(hashes: true)` is called on a file with no uncommitted checkpoints and no prior writer
- **THEN** `details.is_dirty` SHALL be `false`
- **AND** `details.last_writer` SHALL be `null`

#### Scenario: read_file on file with checkpoint

- **WHEN** `read_file(hashes: true)` is called on a file that has an uncommitted checkpoint from a prior `edit`
- **THEN** `details.is_dirty` SHALL be `true`
- **AND** `details.last_writer` SHALL be `"edit"`
