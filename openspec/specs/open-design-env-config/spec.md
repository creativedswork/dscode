# open-design-env-config Specification

## Purpose
TBD - created by archiving change add-open-design-daemon-auto-start. Update Purpose after archive.
## Requirements
### Requirement: .env.example file documents Open Design config
The project SHALL include a `.env.example` file documenting the `OPEN_DESIGN_DIR` and `OD_PORT` environment variables used by the `--with-od` flag.

#### Scenario: .env.example exists and contains required variables
- **WHEN** the repository is cloned
- **THEN** `.env.example` SHALL exist in the project root
- **AND** it SHALL contain `OPEN_DESIGN_DIR` with a commented-out example path
- **AND** it SHALL contain `OD_PORT` with a commented-out default value of `7456`

#### Scenario: User creates .env from example
- **WHEN** a user copies `.env.example` to `.env` and sets `OPEN_DESIGN_DIR` to a valid path
- **THEN** the `--with-od` flag SHALL read `OPEN_DESIGN_DIR` and `OD_PORT` from the `.env` file at startup

### Requirement: .env is gitignored
The `.env` file SHALL be listed in `.gitignore` to prevent accidental commit of local paths.

#### Scenario: .env is ignored by git
- **WHEN** a user creates `.env` in the project root
- **THEN** `git status` SHALL NOT show `.env` as an untracked file

