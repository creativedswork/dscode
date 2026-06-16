## Why

The `processing` state in the Web UI is corrupted during streaming: `assistant_end` (emitted after every agent turn, not just the final one) incorrectly turns `processing` off, causing the Stop button to disappear and session switching to unlock prematurely. Additionally, `assistant_start` redundantly turns it on, and the server-side `permission_response` handler has a missing `break` causing fall-through into the `permission` handler.

## What Changes

- **Remove `setProcessing(false)` from `assistant_end` handler** — `turn_end` fires once per agent turn; only `agent_end` (via `loader: hide`) should turn off processing
- **Remove `setProcessing(false)` from `clear_conversation` handler** — `handleSlashCommand` always sends `loader: hide` after completion
- **Remove `setProcessing(true)` from `assistant_start` handler** — redundant; `handleSend` already sets it immediately on submit
- **Add `break` after `permission_response` case** in the server WebSocket message handler to prevent fall-through into `permission` case
- **Fix fire-and-forget in `handleSlashCommand` fallback** — when a known slash command fails execution and falls through to `promptAndSave`, the `loader: hide` must not be sent until the agent completes
- **Update spec** to explicitly state `assistant_start` does not affect `processing`, and `error` event is a valid OFF trigger (safety net)

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-frontend`: Extend `processing` state spec — add explicit rules that `assistant_start` SHALL NOT set processing on, and `error` events SHALL set processing off. Add session-switch-guard scenario tied to processing state.
- `websocket-protocol`: Add `permission_response` command type scenario — client may respond to a permission prompt with a modified text prompt instead of a direct allow/deny decision.

## Impact

- **Client**: `App.tsx` — 3 lines removed from `handleEvent` switch cases
- **Server**: `web-backend.ts` — `break` added after `permission_response`, `handleSlashCommand` fallback path fixed
- **Spec**: `web-frontend/spec.md` — 2 scenarios added, 1 requirement clause extended; `websocket-protocol/spec.md` — 1 scenario added
- No API changes, no breaking changes
