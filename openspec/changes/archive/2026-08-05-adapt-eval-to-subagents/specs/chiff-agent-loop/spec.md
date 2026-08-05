## ADDED Requirements

### Requirement: Private Eval Agent Loop Prohibition

The Eval coordinator SHALL NOT implement a private LLM/tool loop. Every LLM-dependent CHIEF stage SHALL execute as a standard Agent process through `AgentSupervisor`.

#### Scenario: Eval inference stage starts

- **WHEN** the Eval coordinator starts a graph, oracle, backtracking, attribution, or rule inference stage
- **THEN** it SHALL spawn the stage through `AgentSupervisor`
- **AND** SHALL NOT call a model completion API or execute tools through an Eval-private loop

## REMOVED Requirements

### Requirement: Agent Loop Execution

**Reason**: The eval-private `while (!done) { callLLM; executeTools }` loop bypasses `AgentSupervisor`, duplicates runtime behavior, and does not create real Agent processes.

**Migration**: Execute every LLM stage as a standard SubAgent through the `chief-evaluation-workers` capability.

### Requirement: Soft Limit Enforcement

**Reason**: Tool/turn limits belong to the Agent Application and standard runtime rather than a second eval-only loop.

**Migration**: Configure `maxTurns`, model effort, context policy, and allowed tools in each CHIEF Agent Application.

### Requirement: Tool Sandbox

**Reason**: The custom read/write/grep/glob executor duplicates standard tool capability and path enforcement.

**Migration**: Set worker `cwd` to the eval run directory and use the existing Agent capability layer with read-only tools.

### Requirement: Progress Events

**Reason**: Private loop progress does not participate in the shared Agent process lifecycle and UI activity model.

**Migration**: Derive worker lifecycle/tool progress from AgentSupervisor events and combine it with deterministic CHIEF phase events.

### Requirement: Independent Agent Sessions

**Reason**: CHIFF Pass sessions were in-memory message arrays, not persisted or observable dscode Agent processes.

**Migration**: Spawn a fresh process-only CHIEF worker for each stage and retry; each process receives only its stage prompt and read-only workspace.
