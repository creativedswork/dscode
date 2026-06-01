## ADDED Requirements

### Requirement: CheckpointManager saves a file snapshot before modification

The CheckpointManager SHALL provide a `save(filePath)` method that copies the current file content to a checkpoint directory under `.dscode/checkpoints/{sessionId}/{safeFileName}-{timestamp}/original`. A `meta.json` file SHALL be written alongside containing `filePath`, `baseCommit`, `writerType`, `timestamp`, and `fileVersion`.

#### Scenario: Save creates checkpoint directory with original file

- **WHEN** `checkpointManager.save("/path/to/file.ts")` is called on an existing file
- **THEN** a directory SHALL be created at `.dscode/checkpoints/{sessionId}/{safeFileName}-{timestamp}/`
- **AND** the directory SHALL contain `original` (byte-identical copy of the file) and `meta.json`

#### Scenario: Save on a file that does not yet exist

- **WHEN** `checkpointManager.save("/path/to/newfile.ts")` is called but the file does not exist
- **THEN** the method SHALL record the non-existence in meta.json and create no `original` file
- **AND** the checkpoint SHALL be valid for rollback (restoring non-existence)

#### Scenario: Save overwrites previous checkpoint for same file

- **WHEN** `checkpointManager.save("/path/to/file.ts")` is called twice in the same session
- **THEN** the first checkpoint SHALL be replaced by the second (only the latest checkpoint per file is kept)

### Requirement: CheckpointManager rolls back a file to its checkpoint

The CheckpointManager SHALL provide a `rollback(filePath)` method that restores the file to the state saved in its most recent checkpoint. If the file did not exist at checkpoint time, the file SHALL be deleted. After rollback, the checkpoint SHALL be removed.

#### Scenario: Rollback restores file from checkpoint

- **WHEN** `checkpointManager.rollback("/path/to/file.ts")` is called after a checkpoint was saved and the file was subsequently modified
- **THEN** the file SHALL be restored to the exact content of the checkpoint's `original` file
- **AND** the checkpoint directory SHALL be removed

#### Scenario: Rollback deletes file that did not exist at checkpoint

- **WHEN** `checkpointManager.rollback("/path/to/newfile.ts")` is called and the checkpoint records that the file did not exist
- **THEN** the file SHALL be deleted if it now exists
- **AND** the checkpoint directory SHALL be removed

#### Scenario: Rollback without prior checkpoint throws

- **WHEN** `checkpointManager.rollback("/path/to/file.ts")` is called but no checkpoint exists for that file
- **THEN** an error SHALL be thrown

### Requirement: CheckpointManager commits (cleans up) a checkpoint

The CheckpointManager SHALL provide a `commit(filePath)` method that removes the checkpoint directory for the given file, confirming the modification was successful.

#### Scenario: Commit removes checkpoint

- **WHEN** `checkpointManager.commit("/path/to/file.ts")` is called after a successful edit
- **THEN** the checkpoint directory for that file SHALL be removed
- **AND** subsequent `isDirty()` for that file SHALL return `false`

### Requirement: CheckpointManager detects dirty state

The CheckpointManager SHALL provide an `isDirty(filePath)` method that returns `true` if the file has an uncommitted checkpoint.

#### Scenario: Dirty after save, clean after commit

- **WHEN** `checkpointManager.save("/path/to/file.ts")` is called
- **THEN** `checkpointManager.isDirty("/path/to/file.ts")` SHALL return `true`
- **WHEN** `checkpointManager.commit("/path/to/file.ts")` is subsequently called
- **THEN** `checkpointManager.isDirty("/path/to/file.ts")` SHALL return `false`

#### Scenario: Dirty after save, clean after rollback

- **WHEN** `checkpointManager.save("/path/to/file.ts")` is called
- **AND** `checkpointManager.rollback("/path/to/file.ts")` is called
- **THEN** `checkpointManager.isDirty("/path/to/file.ts")` SHALL return `false`

### Requirement: CheckpointManager lists all dirty files

The CheckpointManager SHALL provide a `listDirty()` method that returns an array of file paths with uncommitted checkpoints.

#### Scenario: listDirty returns all uncommitted files

- **WHEN** `checkpointManager.save("/a.ts")` and `checkpointManager.save("/b.ts")` are called
- **THEN** `checkpointManager.listDirty()` SHALL return `["/a.ts", "/b.ts"]` (order independent)
- **WHEN** `checkpointManager.commit("/a.ts")` is called
- **THEN** `checkpointManager.listDirty()` SHALL return `["/b.ts"]`

### Requirement: CheckpointManager captures base_commit on initialization

The CheckpointManager SHALL attempt to capture the git HEAD commit hash at initialization time by executing `git rev-parse HEAD` in the project directory. If git is not available or the directory is not a git repository, `baseCommit` SHALL be set to `"unknown"`.

#### Scenario: base_commit captured from git

- **WHEN** CheckpointManager is initialized in a git repository at commit `abc1234`
- **THEN** `checkpointManager.getBaseCommit()` SHALL return `"abc1234"`

#### Scenario: base_commit is unknown outside git

- **WHEN** CheckpointManager is initialized in a directory without git
- **THEN** `checkpointManager.getBaseCommit()` SHALL return `"unknown"`
