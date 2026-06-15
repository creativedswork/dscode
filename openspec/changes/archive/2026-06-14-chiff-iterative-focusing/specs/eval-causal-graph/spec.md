# eval-causal-graph Specification (Delta)

## Purpose

对现有 `eval-causal-graph` 规范的增量修改。在保留现有全量 7-step 管线完整不变的前提下，新增迭代聚焦管线（runFocusPipeline）作为大 session（≥500 steps）的归因路径。路径选择在 `runEval` 层根据步骤数自动决定。

## MODIFIED Requirements

### Requirement: Step 1 — Subtask Decomposition (LLM)

The system SHALL support two modes of subtask decomposition:

**Fast path** (<500 steps): The system SHALL call an LLM to decompose the full session into a sequence of subtasks. The LLM prompt SHALL include:
- The session question/title
- A summary of all history steps (stepId, agent, action, thought first 100 chars)
- Instruction to output subtasks with: name, step range (inclusive), oracle (goal + preconditions + key evidence + acceptance criteria), and loop info

**Focus path** (≥500 steps): In Pass 1 Scan, the system SHALL call an LLM to identify 3-5 attention zones from a SessionSkeleton. Within each zone (Pass 2 Zoom), the LLM SHALL decompose that zone into 2-4 zone-level subtasks. Cross-zone subtask synthesis SHALL occur in Pass 3.

The LLM output SHALL be parsed as JSON and validated. On failure, the system SHALL use `safeJsonParse()` and retry once or fall back gracefully.

#### Scenario: Fast path subtask decomposition (unchanged)

- **WHEN** Step 1 LLM call returns valid JSON with subtask array for a session <500 steps
- **THEN** subtasks SHALL cover all history steps without gaps or overlaps
- **AND** each subtask SHALL have a non-empty name and oracle with at least a goal

#### Scenario: Focus path zone identification

- **WHEN** Pass 1 Scan LLM is called with a SessionSkeleton for a session ≥500 steps
- **THEN** the output SHALL be a ScanResult with 3-5 AttentionZones
- **AND** each zone SHALL have stepStart, stepEnd, suspicionScore, and primarySignal

#### Scenario: Focus path zone-level subtask decomposition

- **WHEN** Pass 2 Zoom LLM is called for a zone covering steps 300-360
- **THEN** the output SHALL contain 2-4 ZoneSubtasks covering steps 300-360
- **AND** subtasks SHALL NOT overlap within the zone

### Requirement: Causal Graph Assembly (deterministic)

The system SHALL support two assembly modes:

**Fast path**: The system SHALL assemble a complete causal graph from Step 1-4 outputs using pure TypeScript functions. After assembly, `isGraphComplete()` SHALL verify coverage and edges. If incomplete, fall back to rule-engine.

**Focus path**: Each zone's causal sub-graph SHALL be assembled independently using the same `CausalGraphStore`. In Pass 3, zone sub-graphs SHALL be merged into a unified `CausalGraphSnapshot` for attribution. The merge SHALL preserve zone provenance (each subtask/edge carries its source zoneId).

#### Scenario: Fast path graph completeness (unchanged)

- **WHEN** Step 1-4 outputs are added to the graph store
- **THEN** `isGraphComplete()` SHALL return true only if all coverage checks pass

#### Scenario: Focus path zone sub-graph assembly

- **WHEN** Pass 2 produces ZoneAnalyses for zones Z1 and Z2
- **THEN** each ZoneAnalysis SHALL have its own complete causal sub-graph
- **AND** `zoneGraphComplete` SHALL be true for each zone

#### Scenario: Focus path cross-zone merge

- **WHEN** Pass 3 synthesizes Z1 and Z2 sub-graphs
- **THEN** the merged CausalGraphSnapshot SHALL contain subtasks from both zones
- **AND** subtask IDs SHALL be prefixed with zone IDs (e.g., "Z1_S1")

### Requirement: Step 5 — Candidate Error Set (LLM)

The system SHALL support two candidate identification modes:

**Fast path**: The system SHALL call an LLM with the complete causal graph snapshot and full history. Output: CandidateSet with ≥5 candidates ranked by impactScore.

**Focus path**: Each zone (Pass 2 Zoom) SHALL produce ≥3 zone-level candidates. Pass 3 Synthesize SHALL merge candidates across zones and identify the single root cause. The combined candidate pool SHALL contain ≥5 candidates total.

#### Scenario: Fast path candidate generation (unchanged)

- **WHEN** Step 5 LLM is called with a complete causal graph
- **THEN** the output SHALL contain a CandidateSet with at least 5 candidate steps

#### Scenario: Focus path per-zone candidates

- **WHEN** Pass 2 Zoom LLM is called for a single zone
- **THEN** the output SHALL contain ≥3 ZoneCandidates ranked by impactScore
- **AND** each candidate SHALL reference global step IDs

#### Scenario: Focus path cross-zone candidate merge

- **WHEN** Zone Z1 has 3 candidates and Zone Z2 has 4 candidates
- **THEN** Pass 3 SHALL have ≥7 candidates available for root cause attribution

### Requirement: Step 6 — Counterfactual Root Cause Attribution (LLM)

The system SHALL support two attribution modes:

**Fast path**: The system SHALL call an LLM with the candidate set and apply Rule 1 (Control Flow), Rule 2 (Data Flow), Rule 3 (Irrecoverable Point), and Rule 4 (Taste/Creative Drift) to determine a single root cause.

**Focus path**: Pass 3 Synthesize SHALL call an LLM with all ZoneAnalyses, their top candidates, and global skeleton context. In addition to the four rules, the LLM SHALL identify `cascadePath: CascadeEdge[]` — showing how the root cause error propagated from its origin zone to other zones. The LLM SHALL also provide `alternateRootCauses` when multiple plausible explanations exist.

#### Scenario: Fast path attribution (unchanged)

- **WHEN** Step 6 LLM is called with a candidate set of 5+ candidates
- **THEN** a single `mistakeStep` and `mistakeAgent` SHALL be returned

#### Scenario: Focus path attribution with cascade

- **WHEN** Pass 3 Synthesize identifies root cause in Zone ZA, step 314
- **THEN** `zoneId` SHALL be ZA's id
- **AND** `cascadePath` SHALL contain at least one edge if the error propagated to other zones

#### Scenario: Focus path ambiguous attribution

- **WHEN** the LLM cannot confidently decide between two root cause candidates
- **THEN** the primary attribution SHALL be the higher-confidence one
- **AND** `alternateRootCauses` SHALL contain the other with its confidence score

### Requirement: Extended FailureMode with three-layer error classification

The system SHALL extend CHIFF's original 3 FailureMode types (loop_issue / data_issue / irrecoverability_issue) plus dscode's taste_drift with a three-layer classification framework applied at the candidate and attribution levels.

**Layer 1 — Error Source** (`errorLayer` field on ZoneCandidate):

The LLM SHALL classify each candidate's error source as one of:
- `tool_error`: the tool itself failed (hash ambiguity, network timeout, permission denied, etc.) — not the agent's fault
- `agent_error`: the agent made a judgment mistake (misdiagnosis, overcorrection, perception gap, taste degradation, scope creep)
- `process_error`: a systemic/flow-level issue (repair loop, deadlock, context overflow)

**Layer 2 — Error Type** (`errorType` field on ZoneCandidate):

For `tool_error`:
- `hash_ambiguity`: edit/delete_range matched wrong location due to ambiguous hash anchors
- `network_timeout`: API or network call timed out
- `permission_denied`: tool lacked permission to access target
- `file_not_found`: target file did not exist
- `syntax_error`: bash command or code had syntax errors
- `runtime_error`: code executed but threw at runtime
- `tool_misuse`: agent used the tool with wrong or invalid parameters

For `agent_error`:
- `misdiagnosis`: agent identified wrong root cause and fixed non-problem
- `overcorrection`: agent modified something that didn't need changing
- `perception_gap`: screenshot/result showed problem but agent didn't notice
- `taste_degraded`: output functional but quality degraded (generic, templated)
- `scope_creep`: agent added unnecessary complexity

For `process_error`:
- `repair_loop`: fix attempts created new problems cyclically
- `deadlock`: two or more operations blocked each other
- `context_overflow`: session context exceeded model limits causing truncation

**Layer 3 — Propagation** (reuses existing `cascadePath.mechanism`):

Synthesize SHALL derive the cascade mechanism from the error types of root cause and downstream candidates:
- `hash_ambiguity` or `tool_misuse` → `data_contamination` (bad edits corrupt data)
- `overcorrection` or `perception_gap` → `repair_cascade` (fixing non-problems creates real ones)
- `taste_degraded` → `taste_drift_propagation` (quality loss propagates)
- `permission_denied` or `context_overflow` → `irreversible_lock_in` (agent locked into suboptimal path)

**Relationship to CHIFF FailureMode**: The existing `failure_modes[].type` (loop_issue / data_issue / irrecoverability_issue / taste_drift) remains unchanged and describes where in the graph structure the failure occurred. The new `errorLayer` + `errorType` fields describe WHY the failure occurred — they are complementary, not conflicting.

#### Scenario: Tool error classified as hash_ambiguity

- **WHEN** Pass 2 Zoom analyzes a zone where edit tool failed 8 times with "matched wrong closing brace"
- **THEN** each ZoneCandidate for those errors SHALL have `errorLayer: "tool_error"` and `errorType: "hash_ambiguity"`
- **AND** the candidate's impactScore SHALL reflect the cascading effect of corrupted source files

#### Scenario: Agent error classified as misdiagnosis

- **WHEN** the agent spent 15 steps fixing a "syntax error" that was actually a runtime state issue
- **THEN** the ZoneCandidate SHALL have `errorLayer: "agent_error"` and `errorType: "misdiagnosis"`
- **AND** Synthesize SHALL attribute the root cause to the misdiagnosis step, not the subsequent repair attempts

#### Scenario: CHIFF FailureMode coexists with new classification

- **WHEN** a candidate has `errorLayer: "tool_error"`, `errorType: "hash_ambiguity"`, and `irrecoverable: true`
- **THEN** the existing `failure_modes` SHALL still contain `irrecoverability_issue` as before
- **AND** the new fields SHALL provide additional specificity about WHY the step was irrecoverable
