## ADDED Requirements

### Requirement: WebSocket defines typed Plan client commands
`ClientCommand` SHALL continue to accept an optional `planMode` field for protocol compatibility, but standard Web/TUI Chat adapters SHALL omit it and rely on autonomous routing. The protocol SHALL define `plan_decision`, `plan_approve`, `plan_replan`, and `plan_cancel` variants for typed interaction and internal lifecycle control. Every Plan mutation command SHALL identify the selected Session that owns the active Plan. Typed alignment responses and internal approvals MUST NOT be encoded as ordinary chat text.

#### Scenario: Client answers a Chat-native alignment
- **WHEN** the client sends `plan_decision`
- **THEN** the command carries planId, expectedVersion, commandId, interactionId, and the selected or custom user-value constraint

#### Scenario: Client transport rejects an alignment command
- **WHEN** the WebSocket is not open and cannot write `plan_decision`
- **THEN** the client reports the send as unsuccessful and retains the pending interaction for a later retry with the same command identity

#### Scenario: Client approves execution
- **WHEN** an internal or compatibility adapter sends `plan_approve`
- **THEN** the command carries planId, expectedVersion, commandId, interactionId, semantic revision, digest, and acknowledged side-effect categories

#### Scenario: Client requests replanning
- **WHEN** the client sends `plan_replan`
- **THEN** the command carries planId, expectedVersion, commandId, and a public reason

#### Scenario: Delayed command follows a Session switch
- **WHEN** a Plan command identifies a Session that is no longer selected or a Plan that is no longer active for that Session
- **THEN** the server rejects the mutation and returns the authoritative Plan state for the currently selected Session

### Requirement: WebSocket defines typed Plan server events
`ServerEvent` SHALL define `plan_state`, `plan_interaction`, `plan_ready`, and `plan_conflict` variants.

#### Scenario: Plan changes
- **WHEN** the backend receives a committed `plan:updated` domain event
- **THEN** it sends `plan_state` containing the authoritative immutable snapshot

#### Scenario: Intent alignment is pending
- **WHEN** the backend receives `plan:interaction`
- **THEN** it sends `plan_interaction` with typed Chat-native user-value alignment content

#### Scenario: Plan is authorized for execution
- **WHEN** a committed Plan has an approval and executable items
- **THEN** the server sends the authoritative `plan_state` and one stable `plan_ready` label before scheduling Main execution continuation, allowing clients to derive the global Plan output without a second model summary or a new wire variant

#### Scenario: Plan is replanned
- **WHEN** a new semantic revision is still drafting or awaiting internal authorization
- **THEN** the server does not publish it as the global Plan output; after authorization it publishes the new snapshot and updated stable label as one replacement projection

#### Scenario: Client version is stale
- **WHEN** a command fails PlanStore CAS validation
- **THEN** the server sends `plan_conflict` containing the current version, semantic revision, and snapshot

### Requirement: WebSocket restores Plan projection on connection changes
The server SHALL synchronize active Plan state after connection, Session selection, and backend recovery.

#### Scenario: Client connects with an active Plan
- **WHEN** the initial `ready` exchange completes
- **THEN** the server sends `plan_state`, any authorized `plan_ready`, and any pending `plan_interaction`; clients restore the global Plan output collapsed by default from the authorized snapshot

#### Scenario: Client switches Session
- **WHEN** the selected Session changes
- **THEN** the server clears the old Plan projection and sends the active Plan state for the new Session

#### Scenario: Client restores a terminal Plan
- **WHEN** the selected Session owns a cancelled or failed Plan whose execution authorization has been cleared
- **THEN** the server sends the terminal `plan_state` whose authorization history lets the client reconstruct the last authorized public Plan, while terminal TODO state arrives separately through `task_state`

#### Scenario: No active Plan exists
- **WHEN** the selected Session has no active Plan
- **THEN** the server sends `plan_state` with an explicit empty value

### Requirement: WebSocket synchronizes TaskState independently
`ServerEvent` SHALL define a `task_state` variant containing the selected
Session identity and an immutable TaskState snapshot or explicit empty value.
The event MUST NOT contain PlanExecutionStep state, verification evidence, Tool
history, continuation counters, hidden prompts, or private reasoning. Standard
Web and TUI clients SHALL consume TaskState as read-only state and SHALL NOT
define a presentation command that mutates TODO.

#### Scenario: TaskState changes
- **WHEN** the backend receives a committed `task:updated` domain event for the selected Session
- **THEN** it sends `task_state` containing the authoritative TaskState snapshot

#### Scenario: Client connects with current task state
- **WHEN** the initial `ready` exchange completes
- **THEN** the server sends `task_state` independently of any `plan_state`, allowing Direct requests to restore TODO without a Plan

#### Scenario: Client switches Session
- **WHEN** the selected Session changes
- **THEN** the server clears the old TaskState projection and sends the target Session's TaskState or an explicit empty value

#### Scenario: Plan and task events arrive in either order
- **WHEN** a client receives `plan_state` and `task_state` in any order
- **THEN** it updates separate reducer slices and renders Plan before TODO without deriving one snapshot from the other

#### Scenario: Terminal task is restored
- **WHEN** the owning Main Agent retains a completed, cancelled, failed, or externally blocked TaskState
- **THEN** the server sends that TaskState directly instead of reconstructing terminal TODO statuses from Plan history

### Requirement: Plan commands are idempotent and conflict-aware
The server SHALL deduplicate Plan commands by commandId plus payload digest, SHALL allow one successful command to consume a pending interactionId, and SHALL NOT automatically retry stale approvals against a newer version or semantic revision.

#### Scenario: Duplicate command is received
- **WHEN** a previously applied commandId is received again with the same payload digest
- **THEN** the server returns the stored receipt result or current Plan snapshot without applying a second transition

#### Scenario: Command ID payload differs
- **WHEN** a previously seen commandId is received with a different payload digest
- **THEN** the server rejects the command as invalid without mutating the Plan

#### Scenario: Interaction is consumed twice
- **WHEN** a new commandId attempts to resolve an already consumed interactionId
- **THEN** the server rejects the command and returns the receipt for the successful resolution

#### Scenario: Internal authorization races with replanning
- **WHEN** `plan_approve` references the revision that preceded a replan
- **THEN** the server rejects authorization, sends `plan_conflict`, and requires Planner to validate the new revision before execution

#### Scenario: Conflict snapshot retains a pending interaction
- **WHEN** the authoritative conflict snapshot still contains the visible pending interaction
- **THEN** the client keeps or restores that Chat alignment so the user can answer against the current revision

#### Scenario: Conflict result has no domain event
- **WHEN** HarnessAPI returns a typed conflict without publishing a corresponding domain conflict event
- **THEN** the server sends one authoritative `plan_conflict` to the requesting client and does not duplicate an already projected domain event

## MODIFIED Requirements

### Requirement: Event types and direction
The WebSocket protocol SHALL define a clear set of event types for bidirectional communication, with client-to-server messages called "commands" and server-to-client messages called "events". The ClientCommand type SHALL include a `set_vision_delete` config action to remove the vision model configuration entirely. The `chat` command SHALL accept optional legacy `planMode: "auto" | "plan"` and SHALL treat an omitted value as autonomous routing. Standard product adapters SHALL omit the field. Base types used within commands and events SHALL be imported from the shared UI data model (`src/ui/shared/types.ts`).

#### Scenario: Standard client sends a chat command
- **WHEN** client sends `{"type":"chat","text":"Hello","images":[]}` via WebSocket
- **THEN** server processes the message as user input and Main Agent autonomously chooses direct execution or internal planning

#### Scenario: Compatibility client sends an explicit mode
- **WHEN** an older or diagnostic client includes `planMode`
- **THEN** server preserves the compatible wire behavior without requiring standard product UI to expose that control

#### Scenario: Server sends text delta events
- **WHEN** the AI model produces text output during streaming
- **THEN** server sends `{"type":"text_delta","delta":"partial text..."}` events incrementally

#### Scenario: Client sends set_vision_delete
- **WHEN** client sends `{"type":"config","action":"set_vision_delete"}` via WebSocket
- **THEN** server removes the entire vision configuration and broadcasts the updated ConfigData to all clients

### Requirement: WebSocket protocol message contract unchanged

Existing wire message variants SHALL remain backward compatible. Clients continue to receive `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `info`, `error`, `loader`, `mcp_state`, `config`, and `sessions` messages with identical payload shapes. The additive Plan command and event variants defined by this change do not alter those existing payloads.

#### Scenario: Client receives identical text_delta

- **WHEN** the AI generates text output during streaming
- **THEN** the client SHALL receive `{ "type": "text_delta", "delta": "..." }` with the same structure as before the event bus migration

#### Scenario: Client receives identical tool_start

- **WHEN** the agent invokes a tool
- **THEN** the client SHALL receive `{ "type": "tool_start", "name": "...", "args": {...} }` with the same structure as before

#### Scenario: sessions event with pending permission
- **WHEN** the server sends a `sessions` event and the current session has `pendingPermission` in its metadata
- **THEN** the event's `data` array SHALL include that session's `SessionInfo` with `pendingPermission: { toolName: "...", preview: "...", fuzzyPattern: "..." }`

#### Scenario: sessions event without pending permission
- **WHEN** the server sends a `sessions` event and no session has `pendingPermission`
- **THEN** each `SessionInfo` in `data` SHALL have `pendingPermission` as `undefined` or the field absent

#### Scenario: pendingPermission removed after resolution
- **WHEN** the user resolves the pending permission (allow or deny) and the server re-saves the session
- **THEN** subsequent `sessions` events SHALL NOT include `pendingPermission` for that session

#### Scenario: Plan variants are added
- **WHEN** a Plan-capable client connects
- **THEN** it can use the additive Plan variants without changing the payload contract of any pre-existing variant
