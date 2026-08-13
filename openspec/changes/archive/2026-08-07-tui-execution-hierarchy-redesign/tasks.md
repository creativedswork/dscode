## 1. Execution-aware UI data

- [x] 1.1 Add canonical AgentToolActivity and AgentPermissionActivity types to shared UI data
- [x] 1.2 Extend AgentActivityProjector to upsert Tool lifecycle and Permission state by identity
- [x] 1.3 Add projector tests for parallel Tools, Permission resolution, deduplication, and legacy snapshots

## 2. Runtime and Permission projection

- [x] 2.1 Emit structured Tool start/end progress with executionId, toolCallId, status, and timestamps
- [x] 2.2 Emit SubAgent Permission waiting/resolved progress from the execution-scoped Permission callback
- [x] 2.3 Preserve Harness-level Permission serialization while removing permanent TUI permission-result messages

## 3. TUI execution hierarchy

- [x] 3.1 Store AgentActivity snapshots in TUI content blocks and render structured Execution Cards
- [x] 3.2 Render SubAgent Tool summary/timeline, Permission, result, and status-specific defaults inside the Card
- [x] 3.3 Suppress successful `spawn_agent` as a duplicate Main Tool row while preserving pre-spawn failures
- [x] 3.4 Replace generic Waiting with the most specific active Execution/Tool status when available

## 4. Disclosure interaction and density

- [x] 4.1 Add independent keyboard-accessible Thinking and Tools disclosure state
- [x] 4.2 Apply running/permission/completed/failed default expansion rules without resetting manual choices
- [x] 4.3 Bound visible long details without truncating canonical Activity or Process Store data

## 5. Verification

- [x] 5.1 Add focused TUI tests for hierarchy, folding, Permission lock, spawn deduplication, and long output
- [x] 5.2 Run related agent/UI tests, TypeScript check, production build, and strict OpenSpec validation
- [x] 5.3 Validate running, Permission, completed, failed, parallel, and narrow-terminal flows in a real PTY
