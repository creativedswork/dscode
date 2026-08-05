# chiff-workspace Specification

## Purpose

CHIFF 工作目录生成器。将 SessionSkeleton + HistoryStep 数据渲染为 markdown 文件并落盘到 `~/.dscode/eval/{sessionId}/library/`，供 Agent 通过文件系统工具探索。同时管理 notebook/ 和 output/ 子目录的创建。
## Requirements
### Requirement: Workspace Directory Creation

Before spawning any CHIEF worker, the system SHALL create an isolated run directory:

`~/.dscode/eval/<target-session-prefix>/runs/<eval-run-id>/`

The run directory SHALL contain:

- `manifest.json`: target Session, invoking Session, stage status, and evidence completeness
- `library/`: deterministic read-only trajectory input
- `output/`: coordinator-written validated stage outputs

Workers SHALL receive the run directory as `cwd`. Starting a new eval run SHALL not delete or overwrite another run directory.

For compatibility, the latest completed Dashboard SHALL remain available at `~/.dscode/eval/<target-session-prefix>.html`.

#### Scenario: Create a new isolated run

- **WHEN** `/eval` starts for Session `00MQCGO6`
- **THEN** the system SHALL create a unique directory under `~/.dscode/eval/00MQCGO6/runs/`
- **AND** SHALL create its `library/` and `output/` directories
- **AND** SHALL write `manifest.json` before the first worker starts

#### Scenario: Repeated eval does not overwrite evidence

- **WHEN** two eval runs target the same Session
- **THEN** they SHALL use different eval run IDs
- **AND** each run SHALL retain its own input and stage outputs

### Requirement: Step Detail Files

The system SHALL write normalized `TrajectoryStep` details into bounded JSON chunks under `library/`. Chunks SHALL contain no more than 200 Steps and SHALL preserve global Step IDs, actor-local order, real Agent identity, tool/action metadata, OTAR evidence, timestamps, and evidence quality.

The library SHALL also provide actor-indexed chunk files or an index mapping each Actor ID to its Step ranges so workers can inspect one process without scanning unrelated content.

#### Scenario: Main and SubAgent chunks

- **WHEN** a trajectory contains 340 Steps across Main and three SubAgents
- **THEN** the global trajectory SHALL be split into at least two bounded chunk files
- **AND** every Step SHALL appear exactly once in global chunks
- **AND** the actor index SHALL map every Agent to its Step IDs

#### Scenario: Summary-quality Step

- **WHEN** a Step is generated from an `AgentSessionMessage` fallback
- **THEN** its serialized entry SHALL contain `evidenceQuality: "summary"`
- **AND** SHALL omit unavailable thought and tool-call fields

### Requirement: Workspace Retention

The system SHALL retain the 10 most recent eval run directories across targets and SHALL remove older run directories by creation time after a new run is prepared. Latest compatibility Dashboard files SHALL not count toward the run limit.

An active run MUST NOT be removed.

#### Scenario: Cleanup oldest completed run

- **WHEN** 10 completed run directories exist and a new run starts
- **THEN** the oldest completed run SHALL be removed
- **AND** the active new run SHALL remain

#### Scenario: Preserve active run

- **WHEN** an older run is still marked active during cleanup
- **THEN** cleanup SHALL skip it
- **AND** SHALL remove the next oldest completed run if needed

### Requirement: Multi-Agent Run Manifest

`manifest.json` SHALL include eval run ID, target Session ID, invoking Session ID, created/updated timestamps, actor count, Application count, full/summary/missing transcript counts, chunk index, current CHIEF stage, stage statuses, and final result status.

Manifest writes SHALL be atomic.

#### Scenario: Manifest before worker start

- **WHEN** trajectory preparation completes
- **THEN** the manifest SHALL list all resolved actors and evidence counts
- **AND** the graph stage SHALL be `pending`

#### Scenario: Failed stage retained

- **WHEN** the attribution worker fails after retry
- **THEN** the manifest SHALL mark attribution as `failed`
- **AND** SHALL contain a diagnostic message
- **AND** prior validated outputs SHALL remain available

### Requirement: Actor and Topology Library

The workspace SHALL include machine-readable actor and topology files containing:

- full Agent IDs, Application, role, parent Agent ID, and Application source when available
- spawn, start, exit, and result-return control edges
- transcript evidence quality per Actor
- data-edge index derived from concrete Step references

#### Scenario: Two instances of one Application

- **WHEN** two Explorer processes participate in a Session
- **THEN** `actors.json` SHALL contain two distinct full Agent IDs
- **AND** topology edges SHALL preserve each process's own parent and Steps

### Requirement: Read-Only Library

CHIEF worker tools SHALL be limited to reading/searching `library/` and previously validated `output/` files. Workers SHALL not write `library/`, `output/`, or arbitrary files under the run directory.

#### Scenario: Coordinator persists accepted output

- **WHEN** a worker returns valid graph JSON
- **THEN** the deterministic coordinator SHALL atomically write `output/graph.json`
- **AND** the worker SHALL not require `write_file`
