# M5 Status

Status: `COMMITTED`

## Scope

Completed tasks 6.1-6.6 only:

- Added optional `chat.planMode` with `auto` fallback and typed Plan decision,
  approval, replanning, and cancellation commands.
- Added `plan_state`, `plan_interaction`, and `plan_conflict` server events.
- Mapped Plan commands to `HarnessAPI.plans` and Plan domain events to the
  WebSocket protocol.
- Synchronized active Plan and pending interaction after connection, Session
  switch, and conversation replay; an absent Plan emits explicit `null`.
- Added an independent `PlanViewState` reducer. Plan events remain outside
  `UIMessage[]` and conversation history.
- Added focused protocol, backend, recovery, conflict, and reducer tests.
- Bound every Plan mutation command to its originating Session and reject
  delayed commands unless that Session is still selected and owns the active
  Plan.
- Preserved pending interactions that remain valid in authoritative conflict
  snapshots.
- Restricted the interactive projection to decision/approval interactions with
  typed requests whose interaction ID, Plan ID, revision, and kind match the
  interaction envelope. Cross-interaction requests, direct acceptance events,
  missing requests, and acceptance interactions retained by older state are
  cleared.
- Reconciled mismatched interaction/conflict events against the authoritative
  snapshot: stale transient state is cleared for another Plan or another
  Session, while a still-matching pending interaction remains actionable.
- Added a requesting-client conflict fallback when HarnessAPI returns a
  conflict without a domain event, while suppressing the fallback when the
  matching domain event was already projected.

M6 Web Plan workbench components, styling, controls, and rendering were not
started.

## Files

- `src/application/plan/plan-events.ts`
- `src/application/plan/interaction-projection.ts`
- `src/ui/shared/types.ts`
- `src/ui/shared/plan-reducer.ts`
- `src/ui/web/protocol.ts`
- `src/ui/web/web-backend.ts`
- `web/src/types/index.ts`
- `tests/ui/plan-protocol-fixture.ts`
- `tests/ui/plan-protocol.test.ts`
- `tests/ui/plan-reducer.test.ts`
- `openspec/changes/add-interactive-plan-mode/tasks.md`
- `openspec/changes/add-interactive-plan-mode/M5-STATUS.md`

## Verification

- Targeted protocol, reducer, Session switching, and M4 Plan API/idempotency
  regression: 7 files, 40 tests passed with one worker.
- Focused protocol and reducer regression: 2 files, 21 tests passed with one
  worker.
- `npm run typecheck`: passed.
- `npm run build:web`: passed; Vite reported only the existing chunk-size
  warning.
- `npm run architecture:check`: passed with 0 migration baseline entries.
- `git diff --check`: passed.
- `./node_modules/.bin/openspec validate add-interactive-plan-mode --strict`:
  passed.
- Pre-test target-file hashes remained unchanged across the required five
  second stability window.

## Manual Acceptance

1. Connect a WebSocket client to a Session with a pending decision.
   Expected: `ready`, then authoritative `plan_state`, then
   `plan_interaction` with the persisted interaction ID and payload digest.
2. Send each `plan_decision` action with the selected Session ID, visible
   version, and a fresh command ID.
   Expected: the matching typed action reaches `HarnessAPI.plans`; no chat
   message is synthesized.
3. Switch Sessions, then deliver a delayed command carrying the previous
   Session ID.
   Expected: no Plan mutation runs and the client receives the newly selected
   Session's authoritative `plan_state`.
4. Replay an already accepted command with the same command ID and payload.
   Expected: no second transition and the client receives the current
   `plan_state`.
5. Send stale version or stale revision approval input.
   Expected: `plan_conflict` contains the authoritative version, revision, and
   snapshot; approval is not retried automatically; any interaction still
   pending in that snapshot remains actionable.
6. Exercise conflict paths with and without a matching `plan:conflict` domain
   event.
   Expected: the current client receives exactly one authoritative
   `plan_conflict`.
7. Switch to a Session without an active Plan.
   Expected: `plan_state` carries `null`, and the reducer removes the previous
   Plan, interaction, and conflict without changing conversation messages.

Any mismatch above returns M5 to implementation.

## Review And Delivery

- Milestone verification is complete. The overall review will be performed once
  after all Milestones have been committed.
- Suggested commit: `feat(plan): add websocket plan projection`
- Commit only the files listed in `Files`.
- Exclude all pre-existing untracked files outside this M5 list, including
  `.claude/`, `.cline/`, `.clinerules/`, `.dscode/`, `.tmp/`, `.trae/`,
  `.ttadk/`, `.vscode/`, prototype HTML, OCR data, and unrelated OpenSpec
  changes.
- The user approved the M5 commit and entry into M6 through the confirmation
  dialog on 2026-08-27. No push, amend, rebase, PR, or M6 work was authorized.

## Residual Risk

- The protocol is covered at the backend adapter and reducer boundaries, not by
  a live browser WebSocket end-to-end run.
- Startup process/PlanStore reconciliation remains M8 scope; M5 recovery covers
  projection from the active Plan exposed by HarnessAPI.
