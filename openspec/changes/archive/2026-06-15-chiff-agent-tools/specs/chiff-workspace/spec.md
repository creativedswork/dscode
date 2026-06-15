# chiff-workspace Specification

## Purpose

CHIFF 工作目录生成器。将 SessionSkeleton + HistoryStep 数据渲染为 markdown 文件并落盘到 `~/.dscode/eval/{sessionId}/library/`，供 Agent 通过文件系统工具探索。同时管理 notebook/ 和 output/ 子目录的创建。

## ADDED Requirements

### Requirement: Workspace Directory Creation

The system SHALL create the CHIFF workspace directory structure under `~/.dscode/eval/{sessionId}/` before launching any Agent.

The workspace SHALL contain three subdirectories:
- `library/` — pre-populated by the pipeline, Agent read-only
- `notebook/` — empty, Agent writes analysis notes here
- `output/` — empty, Agent writes structured JSON output here

#### Scenario: Workspace creation for a new eval

- **WHEN** `runFocusPipeline` is called for session `00MQCGO6`
- **THEN** the system SHALL create `~/.dscode/eval/00MQCGO6/library/`
- **AND** the system SHALL create `~/.dscode/eval/00MQCGO6/notebook/`
- **AND** the system SHALL create `~/.dscode/eval/00MQCGO6/output/`

#### Scenario: Existing workspace cleanup

- **WHEN** the workspace directory already exists from a previous eval of the same session
- **THEN** the system SHALL remove all existing files in the workspace
- **AND** the system SHALL recreate the three subdirectories fresh

### Requirement: README Navigation Page

The system SHALL write `library/README.md` as the Agent's entry point. The file SHALL contain:
- A brief description: what this workspace is and how to explore it
- The directory structure overview
- Recommended reading order for the current CHIFF phase
- Task-specific guidance (e.g., "你是 SCANNER，目标是识别 3-5 个 attention zones")

#### Scenario: README for Scan phase

- **WHEN** the workspace is prepared for Pass 1 SCAN
- **THEN** `library/README.md` SHALL recommend reading `meta.md` first, then `skeleton.md`, then `signals.md`
- **AND** SHALL instruct the Agent to output zones to `output/scan-result.json`
- **AND** SHALL suggest writing intermediate notes to `notebook/scan-notes.md`

#### Scenario: README for Zoom phase

- **WHEN** the workspace is prepared for Pass 2 ZOOM
- **THEN** `library/README.md` SHALL recommend reading `notebook/scan-notes.md` first for context
- **AND** SHALL suggest reading `library/steps/P*.md` for step details
- **AND** SHALL instruct the Agent to output analysis to `output/zone-{id}-result.json`

### Requirement: Meta File

The system SHALL write `library/meta.md` containing session-level metadata and statistics.

The file SHALL include:
- `question`: the session's task description
- `totalSteps`: total number of tool calls
- `totalMessages`: total number of session messages
- `errorRate`: fraction of steps with errors (0.0-1.0)
- `duration`: human-readable session duration
- `model`: the AI model used

#### Scenario: Meta file generation

- **WHEN** `writeLibrary()` is called with a SessionSkeleton
- **THEN** `library/meta.md` SHALL be written with all fields populated
- **AND** `errorRate` SHALL be formatted as percentage (e.g., "12.5%")

### Requirement: Skeleton File

The system SHALL write `library/skeleton.md` containing the phase map and hot/cold zone summary.

The file SHALL include:
- **Phase Map**: a markdown table with columns: Phase ID, Label, Step Range, Status (ok/warn/danger), Tool Summary
- **Hot Zones**: for each hot zone — step range, suspicion score, primary signal type, signal count, error count, first 5 agents
- **Cold Zones**: for each cold zone — step range, error count, user message count, tool distribution
- **Analysis Hints**: 2-3 suggestions for what patterns to investigate

#### Scenario: Skeleton with hot and cold zones

- **WHEN** `writeLibrary()` is called with a Skeleton containing 2 hot zones and 2 cold zones
- **THEN** `library/skeleton.md` SHALL contain both in separate sections
- **AND** hot zones SHALL be listed before cold zones
- **AND** the phase map table SHALL show all phases with their status

### Requirement: Signals File

The system SHALL write `library/signals.md` containing all signal anchors grouped by type and sorted by priority.

Signal types SHALL be ordered: `user_complaint`, `tool_error`, `screenshot_divergence`, `phase_transition`, `irreversible_action`, `taste_drift`.

Within each type group, signals SHALL be sorted by priority (high → medium → low).

Each signal entry SHALL include: step ID, priority badge, and label (first 100 characters).

#### Scenario: Signals grouped by type

- **WHEN** the Skeleton has 3 user complaints, 5 tool errors, and 2 screenshot divergences
- **THEN** `library/signals.md` SHALL have three sections in order: "用户投诉 (3)", "工具错误 (5)", "截图偏离 (2)"
- **AND** high-priority tool errors SHALL appear before medium-priority ones within the same section

### Requirement: Data Items File

The system SHALL write `library/data-items.md` containing the complete operation chains for frequently-modified files and assets.

The file SHALL:
- Sort items by `operationCount` descending
- Mark items with `operationCount >= 10` as "🔥 HOT"
- For each item, list all operations: step ID, agent name, action summary (first 80 characters)
- Include a summary count at the top

#### Scenario: Data items with hot items

- **WHEN** a file `src/shaders/water.frag` has been modified 12 times
- **AND** another file `src/main.ts` has been modified 3 times
- **THEN** `water.frag` SHALL appear first with the "🔥 HOT" marker
- **AND** `main.ts` SHALL appear after
- **AND** each operation on `water.frag` SHALL be listed with step ID and agent

### Requirement: Step Detail Files

The system SHALL write step detail files into `library/steps/`, partitioned by phase with a maximum of 150 steps per file.

For phases exceeding 150 steps, the system SHALL split them into multiple files (e.g., `P3-L300-L449.md`, `P3-L450-L599.md`).

Each step entry SHALL include:
- Step ID and agent name
- Action summary (first 150 characters)
- Thought excerpt (first 100 characters, if present)
- Result excerpt (first 200 characters, if present)
- Error marker ("❌" if `isError` is true)

#### Scenario: Phase within 150-step limit

- **WHEN** Phase 1 spans steps 0-145
- **THEN** a single file `P1-L000-L145.md` SHALL be created
- **AND** all 146 steps SHALL be included in order

#### Scenario: Phase exceeding 150-step limit

- **WHEN** Phase 3 spans steps 300-599 (300 steps)
- **THEN** two files SHALL be created: `P3-L300-L449.md` and `P3-L450-L599.md`
- **AND** the first file SHALL contain steps 300-449
- **AND** the second file SHALL contain steps 450-599

#### Scenario: Step without thought block

- **WHEN** a step has no thought content (empty or missing `thinking` block)
- **THEN** the step entry SHALL still include step ID, agent, action, and result
- **AND** the thought field SHALL be omitted rather than displaying "N/A"

### Requirement: Workspace Retention

The system SHALL retain the `N` most recent eval workspace directories and automatically clean older ones to prevent unbounded disk usage.

The default retention count SHALL be 10.

#### Scenario: Auto-cleanup on new eval

- **WHEN** 10 eval workspaces already exist and a new eval starts
- **THEN** the oldest workspace (by modification time) SHALL be deleted
- **AND** the new workspace SHALL be created

#### Scenario: Manual cleanup

- **WHEN** the user runs a cleanup command or the system detects disk pressure
- **THEN** workspaces older than 7 days MAY be removed regardless of total count
