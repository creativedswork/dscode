## Context

The Web UI `processing` boolean gates three behaviors simultaneously:
1. Stop button visibility (replaces Send button)
2. Session switching lock (disables non-active session rows in sidebar)
3. Spinner indicator on the active session row

The `processing` state is currently corrupted because server events that do NOT represent the end of agent activity (`assistant_end` per turn) are incorrectly turning it off, and events that are redundant with client-side triggers (`assistant_start`) are turning it on.

The `web-frontend` spec already states: *"processing is controlled exclusively by `handleSend` and the `loader` event from `agent_end`. The `assistant_end` event SHALL NOT affect the `processing` state."* The code violates this spec.

Additionally, the server-side `permission_response` handler has a missing `break` causing a switch fall-through bug, and `handleSlashCommand` has a fire-and-forget race condition that prematurely sends `loader: hide`.

## Goals / Non-Goals

**Goals:**
- Make `processing` reflect the true state of agent activity (ON from submit until agent fully completes or errors)
- `assistant_end` (per-turn) must not affect `processing`
- `assistant_start` must not redundantly set `processing`
- Fix the `permission_response` fall-through bug
- Fix the `handleSlashCommand` race condition

**Non-Goals:**
- Changing the `agent.prompt()` lifecycle or event emission order
- Modifying the `processing` concept semantics beyond making it correct
- Affecting the TUI backend (uses a different processing model)

## Decisions

### Decision 1: `processing` ON triggers — `handleSend` + `loader: show` only

**Choice**: Remove `setProcessing(true)` from `assistant_start`. Keep `handleSend` (client-side immediate) and `loader: show` (server-side, covers vision pre-processing).

**Rationale**: `handleSend` fires synchronously on user submit, providing zero-latency UI feedback. `loader: show` from `setProcessing(true)` on the server covers the vision/OCR pre-processing phase where the agent hasn't started yet. `assistant_start` is always preceded by `handleSend`, making it redundant.

**Alternatives considered**:
- Keep `assistant_start` as a "belt-and-suspenders" safety net → rejected because it masks state machine bugs and violates the spec's "exclusively" clause
- Remove `loader: show` and rely only on `handleSend` → rejected because `promptWithImages` needs to set processing during pre-processing before `agent.prompt()` is called

### Decision 2: `processing` OFF triggers — `loader: hide` + `error`

**Choice**: Remove `setProcessing(false)` from `assistant_end` and `clear_conversation`. Keep `loader: hide` (agent completion) and `error` (safety net for errors before agent event system fires).

**Rationale**: `turn_end` fires after every agent turn (thinking → tools → text), but the agent continues. Only `agent_end` (which triggers `setProcessing(false)` → `loader: hide`) signals true completion. The `error` event is a safety net for errors that occur before the agent's event system can emit `agent_end` (e.g., `promptAndSave` reject before `agent.prompt()` called).

**Alternatives considered**:
- Keep `assistant_end` setting processing off but assert `turn_end` only fires once → rejected because in multi-turn agent runs (tool calls triggering continuation), `turn_end` fires multiple times per prompt
- Remove `error` as OFF trigger and add `loader: hide` to all error paths → rejected because it requires modifying many error paths across harness and web-backend; the `error` handler is a simpler, centralized safety net

### Decision 3: Permission response fall-through fix

**Choice**: Add `break` after `case "permission_response"` block.

**Rationale**: The `permission_response` case has no `break`, causing fall-through to `case "permission"`. When `permission_response` is sent without `denyReason`, the `if` block is skipped and execution falls through to the `permission` handler, which may create unintended persistent rules or session grants.

### Decision 4: `handleSlashCommand` race condition

**Choice**: When `!executed` (slash command name recognized but execution failed), `await` the `promptAndSave` call instead of fire-and-forget, so `loader: hide` is sent only after the agent completes.

**Rationale**: The current code calls `promptAndSave` without `await` then immediately sends `loader: hide`, which would turn off processing on the client while the agent is still running.

## Risks / Trade-offs

- **Risk**: If `agent_end` fails to fire (e.g., uncaught exception in the agent loop), `processing` stays `true` indefinitely → **Mitigation**: The `promptAndSave` catch block sends an `error` event which sets `processing = false`. The `promptWithImages` catch also sends `error`. In practice, any exception that prevents `agent_end` will propagate to these catch blocks.
- **Risk**: `handleSend` sets `processing = true` before WebSocket send, so if the connection drops before the message is delivered, the UI shows "processing" indefinitely → **Mitigation**: Pre-existing behavior, unchanged by this fix. The WebSocket auto-reconnect would eventually show `Connected` again, but a future improvement could detect dropped sends.
