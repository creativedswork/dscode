## ADDED Requirements

### Requirement: Supervisor-Backed Evaluation Workers

Every LLM-dependent `/eval` stage SHALL execute through `AgentSupervisor.spawn()` using the standard Agent runtime. The eval coordinator SHALL NOT call `completeSimple()` directly and SHALL NOT implement a private LLM/tool loop.

CHIEF workers SHALL be direct children of the active Main Process. They MUST NOT spawn child Agents.

#### Scenario: Run CHIEF graph construction

- **WHEN** the deterministic preparation stage completes
- **THEN** the coordinator SHALL spawn the `chief-graph` Application through AgentSupervisor
- **AND** the resulting process SHALL use the same `PiAgentRuntimeAdapter` lifecycle as other SubAgents
- **AND** its `parentAgentId` SHALL be the active Main Process ID

#### Scenario: Existing maximum depth is preserved

- **WHEN** all CHIEF stages execute
- **THEN** every worker SHALL have Agent depth 1
- **AND** the system-wide `maxDepth` SHALL remain 1

### Requirement: Declarative CHIEF Applications

The package SHALL provide bundled Agent Applications for graph construction, oracle synthesis, hierarchical backtracking, counterfactual attribution, Harness Rule attribution, and semantic rule merge.

Each Application SHALL define its role in an Agent markdown resource and SHALL be overrideable through the existing user/project Agent Application precedence rules. Pipeline code SHALL select Applications by stable role name and SHALL not embed their full system prompts.

#### Scenario: Bundled Applications load

- **WHEN** `AgentApplicationRegistry.load()` loads package resources
- **THEN** all required CHIEF and eval rule Applications SHALL compile successfully
- **AND** each Application SHALL be available by its stable name

#### Scenario: Project override changes evaluation behavior

- **WHEN** a project provides an Agent markdown override for `chief-attribution`
- **THEN** subsequent attribution workers SHALL use the compiled project override
- **AND** no eval pipeline source change SHALL be required

### Requirement: Read-Only Worker Capability

CHIEF workers SHALL run with `cwd` set to the current eval run directory and SHALL only receive read-only tools required to inspect that workspace. They SHALL not receive project mutation tools, shell execution, Agent process tools, or permission-prompting capabilities.

Accepted structured output SHALL be returned as the Agent exit output. The deterministic coordinator, not the worker, SHALL persist validated stage output under `output/`.

#### Scenario: Worker reads its library

- **WHEN** a CHIEF worker calls `read_file` for `library/actors.json`
- **THEN** capability validation SHALL allow the read

#### Scenario: Worker attempts project mutation

- **WHEN** a CHIEF worker attempts `write_file`, `edit`, `bash`, or a path outside its run directory
- **THEN** the standard Agent capability layer SHALL reject the call
- **AND** no project file SHALL be modified

### Requirement: Structured Agent Output Validation

The coordinator SHALL validate each worker's final output against the stage's TypeScript schema before accepting it. Invalid JSON, missing required fields, invalid actor references, or invalid step references SHALL cause one retry in a new Agent process with a concise validation correction prompt.

If the retry fails, `/eval` SHALL terminate with a stage-specific error and SHALL not generate a final Dashboard from partial or invalid attribution.

#### Scenario: Valid first output

- **WHEN** a worker returns JSON satisfying its stage schema and trajectory references
- **THEN** the coordinator SHALL accept the output
- **AND** SHALL write it to the run `output/` directory
- **AND** SHALL not spawn a retry worker

#### Scenario: Invalid output succeeds on retry

- **WHEN** the first `chief-backtrack` worker references an unknown Agent ID
- **THEN** the coordinator SHALL reject the output
- **AND** SHALL spawn one new `chief-backtrack` worker with the validation error
- **AND** SHALL continue if the second output is valid

#### Scenario: Two invalid outputs

- **WHEN** both worker attempts fail schema validation
- **THEN** `/eval` SHALL report the failing CHIEF stage
- **AND** SHALL retain run artifacts for diagnosis
- **AND** SHALL not overwrite the latest successful Dashboard

### Requirement: Generic Process Recording Policy

`SpawnAgentRequest`, runtime `AgentProcess`, and persisted `SerializedAgentProcess` SHALL support `recording: "session" | "process-only"`. The default SHALL be `"session"` for backward compatibility.

Both recording modes SHALL persist Process Store state and emit normal Agent lifecycle/activity events. Only `"session"` processes SHALL be projected into parent Session `agentMessages`.

#### Scenario: Existing task Agent defaults to Session recording

- **WHEN** a caller spawns an Agent without specifying `recording`
- **THEN** the process SHALL use `"session"`
- **AND** its terminal result SHALL be stored in the parent Session as before

#### Scenario: CHIEF worker uses process-only recording

- **WHEN** `/eval` spawns any CHIEF worker
- **THEN** the worker SHALL use `"process-only"`
- **AND** Agent Activity SHALL show its lifecycle in real time
- **AND** its terminal result SHALL not be added to Session `agentMessages`

#### Scenario: Load legacy process record

- **WHEN** AgentProcessStore loads a version 1 record without `recording`
- **THEN** the process SHALL be interpreted as `"session"`

### Requirement: Invoking Session Routing

CHIEF worker lifecycle and progress events SHALL be associated with the Session that invoked `/eval`, even when the target Session being evaluated is different. Target Session data SHALL remain read-only.

#### Scenario: Historical target with current invoking Session

- **WHEN** Session B invokes `/eval A`
- **THEN** CHIEF workers SHALL have `parentSessionId` B
- **AND** their live Agent Activity SHALL only be visible in B
- **AND** Dashboard metadata SHALL identify A as the evaluated Session

### Requirement: Worker Cancellation

Aborting the `/eval` operation or shutting down the Harness SHALL terminate any active CHIEF workers and SHALL prevent later stages from spawning.

#### Scenario: Abort during oracle synthesis

- **WHEN** eval is aborted while `chief-oracle` is running
- **THEN** AgentSupervisor SHALL terminate that worker
- **AND** no `chief-backtrack` worker SHALL start
- **AND** the incomplete run directory MAY remain for diagnosis
