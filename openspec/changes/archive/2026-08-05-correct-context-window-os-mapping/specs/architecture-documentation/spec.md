## ADDED Requirements

### Requirement: Agent as OS mappings reflect runtime semantics

Architecture documentation SHALL map Agent concepts to OS concepts according to their capacity, lifecycle, volatility, and persistence behavior. The context window SHALL be described as RAM or an Agent process working set, not as CPU registers.

#### Scenario: Context window mapping is documented

- **WHEN** a reader inspects the Agent as OS mapping
- **THEN** the context window SHALL map to `RAM / Agent 进程工作集`
- **AND** the mapping SHALL be consistent with token budgeting, compaction, and overflow recovery

### Requirement: Context and persistent memory remain distinct

Architecture documentation SHALL distinguish active model context from persisted Session snapshots and cross-Session Memory. It SHALL identify ContextManager as the working-set manager, Session or Runtime Snapshot as recoverable backing state, and MemoryManager as persistent long-term knowledge storage.

#### Scenario: Reader compares Context and Memory

- **WHEN** a reader follows the memory hierarchy explanation
- **THEN** the document SHALL explain that MemoryManager content persists across Sessions
- **AND** persistent memories SHALL only affect inference after being injected into the active context
- **AND** the document SHALL NOT imply that MemoryManager and the context window are the same storage layer

### Requirement: OS analogy does not invent managed components

Architecture documentation MUST NOT assign a dscode runtime component to an OS concept unless the mapping is supported by current implementation behavior.

#### Scenario: Register analogy is considered

- **WHEN** the document discusses the context window or dscode-managed Agent state
- **THEN** it SHALL NOT label the context window as registers
- **AND** it MAY omit a register mapping because model-internal execution state is outside the Harness contract
