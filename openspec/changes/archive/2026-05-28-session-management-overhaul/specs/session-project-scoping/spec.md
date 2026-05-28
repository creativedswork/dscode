## ADDED Requirements

### Requirement: Sessions are scoped by project directory
The system SHALL store sessions in project-specific subdirectories under `sessions/by-project/<slug>/` where `<slug>` is derived from the absolute project path. Each project directory SHALL have its own isolated `index.json` and session files.

#### Scenario: Session saved in a project is stored in that project's directory
- **WHEN** a session is saved while working in project `/Users/alice/projects/myapp`
- **THEN** the session file is stored under `sessions/by-project/Users_alice_projects_myapp/`
- **AND** the project's `index.json` is updated with the session metadata

#### Scenario: Sessions from different projects are isolated
- **WHEN** user lists sessions in project `/Users/alice/projects/myapp`
- **THEN** only sessions stored under that project's slug are shown
- **AND** sessions from project `/Users/alice/projects/other` are not visible

### Requirement: SessionMetadata includes projectPath
The `SessionMetadata` type SHALL include a `projectPath` field containing the absolute path of the project directory where the session was created.

#### Scenario: New session records its project path
- **WHEN** a new session is created in project `/Users/alice/projects/myapp`
- **THEN** the session metadata's `projectPath` field equals `/Users/alice/projects/myapp`

#### Scenario: Existing sessions without projectPath are unscoped
- **WHEN** a session file created before this change (no `projectPath` field) is encountered
- **THEN** it is treated as "unscoped" and appears only in the global `--all` list, not in any project-specific list

### Requirement: Slug generation is deterministic and collision-resistant
The system SHALL generate a project slug by replacing all `/` and `\` characters in the absolute path with `_`, stripping leading `_`, and appending a dash followed by the first 8 hex characters of the SHA-256 hash of the path.

#### Scenario: Same path always produces same slug
- **WHEN** slug is generated for path `/Users/alice/projects/myapp` twice
- **THEN** both calls return the identical slug

#### Scenario: Different paths produce different slugs
- **WHEN** slugs are generated for `/home/alice/projects/myapp` and `/home/alice/projects/other`
- **THEN** the two slugs are different

### Requirement: Global index is maintained for backward compatibility
The system SHALL maintain a combined `sessions/index.json` containing metadata for all sessions across all projects, for use with the `--all` flag.

#### Scenario: Global index includes sessions from multiple projects
- **WHEN** sessions exist in both project A and project B
- **THEN** `sessions/index.json` contains entries from both projects
