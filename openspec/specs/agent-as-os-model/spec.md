# agent-as-os-model Specification

## Purpose

Define the implementation-grounded Agent as OS model for dscode architecture documentation, including process, memory, I/O, capability, communication, and persistence boundaries.

## Requirements

### Requirement: Agent as OS model is layered and implementation-grounded

The architecture documentation SHALL organize the Agent as OS analogy into explicit architectural layers and MUST derive every mapping from current dscode behavior. It MUST distinguish exact ownership boundaries from approximate OS analogies.

#### Scenario: Reader inspects the complete model

- **WHEN** a reader opens the Agent as OS section
- **THEN** the documentation SHALL cover kernel and compute, applications and processes, memory and state, I/O, capabilities and isolation, and communication and recovery
- **AND** each mapped dscode component SHALL have an implementation-supported responsibility

### Requirement: Kernel and execution concepts remain distinct

The architecture documentation SHALL map Harness to the Kernel, Model to the compute or execution engine, and Agent Runtime to the execution environment for one Agent process. It MUST NOT map System Prompt to the Kernel.

#### Scenario: Reader compares Harness and System Prompt

- **WHEN** a reader examines kernel ownership
- **THEN** Harness SHALL own assembly, lifecycle, permissions, and I/O coordination
- **AND** System Prompt SHALL be described as process bootstrap policy or a read-only instruction segment
- **AND** System Prompt SHALL NOT duplicate the Kernel mapping

### Requirement: Application definitions remain distinct from process instances

The architecture documentation SHALL distinguish AgentApplication / Agent.md definitions from running Main Agent and SubAgent process instances.

#### Scenario: Agent process is created

- **WHEN** AgentSupervisor creates an Agent from an immutable AgentApplication snapshot
- **THEN** AgentApplication / Agent.md SHALL map to an application definition, executable image, or manifest
- **AND** Main Agent / SubAgent SHALL map to process instances
- **AND** agentId and parentAgentId SHALL map to PID and PPID
- **AND** AgentContext SHALL map to PCB-like execution context, cwd, credentials, and capabilities

### Requirement: Process management does not imply unimplemented scheduling

The architecture documentation SHALL describe AgentSupervisor as process table, lifecycle management, and foreground/background job control. It MUST NOT claim that dscode implements a preemptive OS scheduler unless scheduling capabilities exist in code.

#### Scenario: Supervisor responsibilities are documented

- **WHEN** a reader reviews spawn, wait, terminate, kill, suspend, continue, or background operations
- **THEN** those operations SHALL be attributed to process lifecycle and job control
- **AND** the documentation SHALL state that no time-slice or priority scheduler is currently implemented

### Requirement: Tool, Driver, and Resource form separate I/O layers

The architecture documentation SHALL distinguish Agent-callable operations from the adapters that implement them and from the resources being operated.

#### Scenario: Agent reads a file

- **WHEN** an Agent calls `read_file`
- **THEN** `read_file` SHALL be classified as a Tool Call analogous to a system call
- **AND** its Tool Schema SHALL be classified as the call ABI
- **AND** ToolRegistry SHALL be classified as the callable operation registry or syscall table
- **AND** the filesystem Driver SHALL be classified as the resource adapter
- **AND** the filesystem SHALL be classified as the operated resource

#### Scenario: Agent invokes an MCP tool

- **WHEN** an Agent calls a Tool provided through MCP
- **THEN** the MCP Tool SHALL remain the callable operation
- **AND** the MCP integration Driver SHALL adapt that operation to the MCP Server
- **AND** the MCP Server SHALL be described as an external application, device, or remote service according to its actual role

### Requirement: Skills remain user-space capability modules

The architecture documentation SHALL describe Skill as an on-demand user-space capability module or library and `SKILL.md` as its manifest and instruction source. It MUST NOT classify `SKILL.md` as a file descriptor or classify Skill as a device Driver.

#### Scenario: Skill is activated

- **WHEN** SkillManager activates a Skill
- **THEN** its instructions and allowed Tool set SHALL be described as process-level capabilities
- **AND** the underlying Driver SHALL remain responsible for resource access
- **AND** no file descriptor analogy SHALL be introduced without a runtime resource-handle implementation

### Requirement: Security and isolation mappings reflect enforcement

The architecture documentation SHALL map PermissionManager to capability, ACL, and system-call filtering concepts, and SHALL map Worktree isolation to a filesystem namespace or sandbox.

#### Scenario: Tool access is constrained

- **WHEN** AgentContext derives allowed and denied Tools and PermissionManager evaluates a Tool Call
- **THEN** the documentation SHALL identify both capability inheritance and call-time policy enforcement
- **AND** Worktree isolation SHALL be described as filesystem isolation rather than a separate Agent process

### Requirement: Communication and persistence roles remain explicit

The architecture documentation SHALL distinguish directed Agent messages, Harness event distribution, interactive Session semantics, serialized snapshots, persistent Memory, and file edit checkpoints.

#### Scenario: Runtime state is communicated and persisted

- **WHEN** a reader traces an Agent from active execution to saved state
- **THEN** Agent Message SHALL map to directed IPC
- **AND** HarnessEventBus SHALL map to in-kernel event distribution
- **AND** Session SHALL retain its TTY-like interaction role while serialized messages are identified as recoverable state
- **AND** Runtime Snapshot SHALL map to a process snapshot or backing store
- **AND** MemoryManager SHALL map to persistent long-term knowledge storage
- **AND** CheckpointManager SHALL map to file-level snapshot or rollback journal, not a process checkpoint

### Requirement: Analogy boundaries are documented

The Agent as OS section MUST state that the mapping is an architectural analogy rather than a claim that dscode implements a complete operating system. Unimplemented concepts MUST be omitted or marked as absent.

#### Scenario: No matching runtime primitive exists

- **WHEN** an OS concept such as CPU registers, file descriptors, or preemptive scheduling has no dscode-managed equivalent
- **THEN** the documentation SHALL omit the mapping or explicitly mark the capability as not implemented
- **AND** it MUST NOT assign an unrelated component solely to make the table appear complete
