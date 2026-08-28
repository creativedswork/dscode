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

#### Scenario: PlanItem is assigned
- **WHEN** an execution item is bound to a Main Agent or SubAgent
- **THEN** the binding references the process identity without converting the PlanItem into that process

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
