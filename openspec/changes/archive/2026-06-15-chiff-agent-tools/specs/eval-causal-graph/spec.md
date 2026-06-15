# eval-causal-graph Specification (Delta)

## MODIFIED Requirements

### Requirement: Adaptive Pipeline Path Selection

The system SHALL select between the Agent-based focus pipeline and the completion-based fast path based on session step count.

When `steps.length >= FOCUS_PATH_THRESHOLD` (default 500):
- The system SHALL use the Agent-based pipeline (`runFocusPipeline`)
- The system SHALL first write the workspace to `~/.dscode/eval/{sessionId}/library/`
- Each CHIFF Pass SHALL spawn an independent Agent session with file system tools
- The system SHALL display Phase progress during Agent execution

When `steps.length < FOCUS_PATH_THRESHOLD`:
- The system SHALL use the completion-based pipeline (`runCausalGraphPipeline`)
- The system SHALL NOT create a workspace directory
- Behavior SHALL be identical to the current fast path

#### Scenario: Large session triggers Agent path

- **WHEN** `/eval` is run on a session with 800 steps
- **THEN** the system SHALL select the Agent-based focus pipeline
- **AND** SHALL create `~/.dscode/eval/{sessionId}/` with library/, notebook/, output/
- **AND** SHALL display Phase progress (Phase 0/4 → 1/4 → 2/4 → 3/4 → 4/4)

#### Scenario: Small session uses fast path

- **WHEN** `/eval` is run on a session with 200 steps
- **THEN** the system SHALL select `runCausalGraphPipeline`
- **AND** SHALL NOT create a workspace directory
- **AND** behavior SHALL match the pre-agent implementation

### Requirement: Agent-Based Analysis Pipeline

The system SHALL implement a three-pass Agent pipeline that replaces the completion-based `scanSession`, `zoomZone`, and `synthesize` calls.

**Pass 1 — SCAN Agent**: 
- System prompt SHALL define the Agent as a session scanner
- Task prompt SHALL instruct the Agent to explore `library/` and identify 3-5 attention zones
- The Agent SHALL have access to `read_file`, `grep`, `glob`, `write_file` tools
- The Agent SHALL write structured output to `output/scan-result.json`
- The Agent MAY write analysis notes to `notebook/scan-notes.md`

**Pass 2 — ZOOM Agent** (one per attention zone):
- System prompt SHALL define the Agent as a causal graph analyst
- Task prompt SHALL instruct the Agent to deep-dive a specific zone's steps
- The Agent SHALL read `notebook/scan-notes.md` for context
- The Agent SHALL read `library/steps/P*.md` for step details
- The Agent SHALL write structured output to `output/zone-{id}-result.json`
- The Agent MAY write analysis notes to `notebook/zone-{id}-analysis.md`

**Pass 3 — SYNTHESIZE Agent**:
- System prompt SHALL define the Agent as a cross-zone synthesizer
- Task prompt SHALL instruct the Agent to cross-reference all zone analyses
- The Agent SHALL read all `notebook/zone-*.md` files
- The Agent SHALL write structured output to `output/attribution.json`
- The Agent MAY write analysis notes to `notebook/synthesis-notes.md`

#### Scenario: Three-pass Agent pipeline execution

- **WHEN** `runFocusPipeline` is called for a large session
- **THEN** the system SHALL execute Pass 1 SCAN Agent, wait for completion, and parse `output/scan-result.json`
- **AND** for each zone in the scan result, the system SHALL execute a Pass 2 ZOOM Agent
- **AND** after all zones complete, the system SHALL execute Pass 3 SYNTHESIZE Agent
- **AND** the system SHALL compose the final `EvalResult` from the structured outputs

#### Scenario: Pass 1 Agent produces no zones

- **WHEN** the SCAN Agent outputs `noIssuesDetected: true` in `output/scan-result.json`
- **AND** the system SHALL return the session stats result (no issues detected)
- **AND** the system SHALL return the rule engine result

#### Scenario: Pass 2 Agent fails for a zone

- **WHEN** a ZOOM Agent fails to produce valid `output/zone-{id}-result.json`
- **THEN** the system SHALL mark that zone as failed
- **AND** the system SHALL continue with remaining zones
- **AND** the SYNTHESIZE Agent SHALL be informed of partial data

#### Scenario: Pass 3 Agent cross-references notebooks

- **WHEN** the SYNTHESIZE Agent is launched
- **THEN** the Agent SHALL have access to all `notebook/zone-*.md` files written by ZOOM Agents
- **AND** the Agent SHALL have access to `notebook/scan-notes.md` from the SCAN Agent
- **AND** the Agent SHALL produce `output/attribution.json` with root cause and cascade path

### Requirement: Pipeline Output Consistency

The Agent-based focus pipeline SHALL produce `EvalResult` output that is structurally identical to the completion-based pipeline.

The `composeEvalResult` function SHALL map Agent outputs to the same `EvalResult` type used by all downstream consumers (dashboard, session storage, CLI display).

#### Scenario: Agent pipeline produces valid EvalResult

- **WHEN** the Agent-based pipeline completes successfully
- **THEN** `composeEvalResult` SHALL produce an `EvalResult` with all required fields: metadata, stats, phases, deviations, rootCauses, rules, attribution
- **AND** the result SHALL pass the same validation as the completion-based pipeline
- **AND** the dashboard SHALL render without modification

### Requirement: Pipeline Fallback on Agent Failure

The system SHALL return a partial EvalResult with `agentFailed: true` annotation if the Agent-based pipeline encounters an unrecoverable error. The system SHALL NOT throw — it SHALL always return a valid EvalResult structure.

#### Scenario: Workspace creation fails

- **WHEN** the system cannot create `~/.dscode/eval/{sessionId}/` (e.g., disk full, permission denied)
- **THEN** the system SHALL log a warning
- **AND** the system SHALL fall back to `runCausalGraphPipeline` if session <500 steps; if ≥500 steps, the system SHALL return a partial EvalResult with `agentFailed: true`, preserving sessionStats metadata and stats

#### Scenario: All Agent passes exceed maxToolCalls

- **WHEN** all three Agent passes fail to produce valid output
- **THEN** the system SHALL return a partial EvalResult with `agentFailed: true`
- **AND** the `EvalResult.attribution` SHALL be `null`
- **AND** the dashboard SHALL display "Agent 分析失败（已返回部分结果）"
