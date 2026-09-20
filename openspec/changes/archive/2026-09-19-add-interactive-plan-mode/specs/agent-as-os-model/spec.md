## ADDED Requirements

### Requirement: Planner follows the application and process model
The Plan Mode Planner SHALL be defined as an immutable AgentApplication and SHALL execute as an AgentProcess created and supervised by AgentSupervisor.

#### Scenario: Planner process is created
- **WHEN** a request enters Plan Mode
- **THEN** Supervisor creates a distinct Planner AgentProcess from the internal Planner AgentApplication and records its parent Main Agent

#### Scenario: Planner capabilities are inspected
- **WHEN** the Planner process context is built
- **THEN** its effective capabilities derive from the immutable `permissionMode: plan` application snapshot

#### Scenario: Planning finishes
- **WHEN** the Planner reaches an internally authorized Plan revision or is cancelled
- **THEN** the Planner process exits without changing its application capabilities into execution capabilities

#### Scenario: Planning is cancelled
- **WHEN** the Planner exits because the user cancelled planning
- **THEN** Supervisor returns Main to idle and does not resume execution of the cancelled request

### Requirement: Plan records remain distinct from OS process concepts
The system MUST model a PlanRecord as persistent desired work and decisions, not as an AgentProcess, Session, TTY, background Job, or shared task queue.

#### Scenario: Plan survives Planner exit
- **WHEN** the Planner process exits after internal authorization
- **THEN** the PlanRecord remains available for the Main Agent and presentation adapters

#### Scenario: Session is switched
- **WHEN** a UI switches away from a Session with an active Plan
- **THEN** the Plan remains stored independently and the Session continues to serve only as its interaction attachment

#### Scenario: Plan execution step is assigned
- **WHEN** a PlanExecutionStep is bound to a Main Agent or SubAgent
- **THEN** the binding references the process identity without converting the PlanExecutionStep into that process

#### Scenario: Main tracks current task progress
- **WHEN** Main creates or updates TaskState in its persisted AgentContext
- **THEN** TaskState remains process-owned context rather than becoming a Session, TTY, PlanRecord, background Job, or shared task queue

#### Scenario: Main process is restored
- **WHEN** AgentSupervisor restores a Main AgentProcess for a Session
- **THEN** it restores that Main context's TaskState independently from PlanStore and runtime execution counters

### Requirement: Supervisor provides foreground job control for planning
AgentSupervisor SHALL transfer the active Session attachment between Main and Planner processes and SHALL keep their lifecycle states explicit.

#### Scenario: Planner takes foreground control
- **WHEN** a complex request starts planning
- **THEN** Main becomes `waiting` and Planner becomes the foreground process attached to the Session

#### Scenario: Planner waits for user-value input
- **WHEN** Planner requests Chat-native intent alignment
- **THEN** Planner remains the foreground process in `waiting` rather than being represented as a completed task

#### Scenario: Main resumes after internal authorization
- **WHEN** Planner exits with an internally authorized Plan reference
- **THEN** Supervisor restores Main as the foreground process and supplies the approved planId, revision, and digest

### Requirement: Plan terminal cleanup preserves role-specific lifecycle
Terminal cleanup SHALL clear Plan bindings from Main and bound SubAgents.
For a completed Plan, Supervisor SHALL terminate remaining bound SubAgents but
SHALL keep the owning Main process alive for TaskState finalization and the
final user report. For a cancelled or failed Plan, Supervisor SHALL retain the
existing Main termination behavior.

#### Scenario: Plan completes
- **WHEN** the Plan commits `completed`
- **THEN** Supervisor clears Main's active Plan and step binding, terminates remaining bound SubAgents, and leaves Main running

#### Scenario: Completed Main reports
- **WHEN** terminal cleanup has already removed Main's active Plan
- **THEN** the Host may use its report tracker to run one final Main turn without reattaching Plan execution authority

#### Scenario: Plan is cancelled or failed
- **WHEN** the Plan commits `cancelled` or `failed`
- **THEN** Supervisor clears bindings and terminates Main according to the terminal failure path
