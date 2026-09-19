## ADDED Requirements

### Requirement: AgentSupervisor schedules cooperative execution episodes
The AgentSupervisor and Harness SHALL treat an execution episode as a bounded
cooperative scheduling interval for an existing AgentProcess. The architecture MUST
NOT describe episode stopping as preemptive process scheduling because an in-flight
model response or Tool invocation completes before the turn-stop boundary applies.

#### Scenario: Episode reaches a stop boundary
- **WHEN** the Executive Monitor requests a stop during an active turn
- **THEN** the Harness stops before the next model turn while retaining the same AgentProcess and Session

#### Scenario: Reflection begins
- **WHEN** the first execution episode reaches an impasse
- **THEN** the Supervisor resumes the existing Main AgentProcess with a bounded reflection frame rather than creating a Critic Agent

#### Scenario: Episode pauses inconclusively
- **WHEN** automatic execution pauses without a proven blocker or failure
- **THEN** the AgentProcess remains resumable and the Session remains the interactive TTY

### Requirement: Executive facts remain separate from model cognition
The Host SHALL own episode budgets, progress snapshots, action fingerprints, and
impasse transitions. The system MUST NOT persist private Chain-of-Thought or treat a
model statement of progress as an authoritative lifecycle fact.

#### Scenario: Model claims completion without accepted outcomes
- **WHEN** Main states that work is complete but persisted Plan and TaskState outcomes remain incomplete
- **THEN** the Host retains the incomplete execution state

#### Scenario: Host requests reflection
- **WHEN** the first impasse triggers reflection
- **THEN** the persisted incident contains concise observable facts and excludes hidden reasoning text
