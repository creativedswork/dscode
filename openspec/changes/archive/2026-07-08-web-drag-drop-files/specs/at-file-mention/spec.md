## ADDED Requirements

### Requirement: Absolute path resolution for at-file references
The at-file resolver's `safeResolveWithin` SHALL accept absolute paths that point to existing files, in addition to paths within the project directory.

#### Scenario: Absolute path to file inside project
- **WHEN** user submits a message containing `@/Users/x/project/src/core/main.ts` (absolute path to a file within the project directory)
- **THEN** the resolver SHALL resolve and read the file normally, the same as the relative `@src/core/main.ts`

#### Scenario: Absolute path to file outside project
- **WHEN** user submits a message containing `@/Users/x/Downloads/report.pdf` (absolute path to a file outside the project directory)
- **THEN** the resolver SHALL NOT reject it as `path_escape`
- **AND** the resolver SHALL check that the file exists at the given absolute path
- **AND** if the file exists, it SHALL be processed according to the same file-type rules (text, image, binary) as project files

#### Scenario: Absolute path to non-existent file
- **WHEN** user submits a message containing `@/tmp/nonexistent.txt` (absolute path to a file that does not exist)
- **THEN** the resolver SHALL report a `not_found` warning, the same as for a non-existent relative path

#### Scenario: Relative path still restricted to project
- **WHEN** user submits a message containing `@../../etc/passwd` (relative path escaping the project directory)
- **THEN** the resolver SHALL still reject it with a `path_escape` warning
- **AND** only absolute paths (starting with `/`) are permitted to reference files outside the project
